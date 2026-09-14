"""Deterministic topic discovery and NetworkX-backed subject knowledge graphs."""
from collections import Counter
import re

import networkx as nx
from sqlalchemy.orm import Session

from app.models.models import Topic, TopicRelationship, QuestionTopicMapping

STOP_WORDS = {
    "about", "after", "also", "another", "between", "chapter", "course", "describe", "each",
    "explain", "following", "from", "have", "into", "learning", "more", "notes", "other",
    "overview", "subject", "that", "their", "these", "this", "those", "through", "topic",
    "using", "what", "when", "which", "with", "your", "will", "would", "should", "could",
}


def normalize_topic(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", value.lower())).strip()


def extract_topic_candidates(text: str, limit: int = 20) -> list[str]:
    """Find recurring academic noun phrases without needing another model or API call."""
    text = re.sub(r"\s+", " ", text)
    phrases = []
    # Numbered headings and title-like phrases are stronger signals than loose words.
    for value in re.findall(r"(?:^|[\n.!?])\s*(?:\d+(?:\.\d+)*[.)-]?\s*)?([A-Z][A-Za-z0-9/& -]{2,70})", text):
        value = value.strip(" -:.")
        if 1 < len(value.split()) <= 6:
            phrases.append(value)
    words = re.findall(r"[a-zA-Z][a-zA-Z-]{2,}", text.lower())
    for index in range(len(words) - 1):
        phrase = " ".join(words[index:index + 2])
        if not any(word in STOP_WORDS for word in phrase.split()):
            phrases.append(phrase)
    counts = Counter(normalize_topic(p) for p in phrases if normalize_topic(p))
    selected = []
    for normalized, _ in counts.most_common(limit * 3):
        if len(normalized) < 4 or normalized in STOP_WORDS or normalized in selected:
            continue
        selected.append(normalized)
        if len(selected) >= limit:
            break
    return selected


def _display_name(normalized: str) -> str:
    return " ".join(word.upper() if len(word) <= 4 else word.capitalize() for word in normalized.split())


def rebuild_subject_graph(db: Session, subject_id: str, chunks: list[str]) -> dict:
    """Persist a compact graph. Prerequisite edges are only inferred from ordering/signals."""
    db.query(TopicRelationship).filter(TopicRelationship.subject_id == subject_id).delete()
    candidates = extract_topic_candidates("\n".join(chunks))
    topics = []
    for name in candidates:
        topic = db.query(Topic).filter(Topic.subject_id == subject_id, Topic.normalized_name == name).first()
        frequency = sum(name in normalize_topic(chunk) for chunk in chunks)
        if topic:
            topic.frequency = frequency
        else:
            topic = Topic(subject_id=subject_id, name=_display_name(name), normalized_name=name, frequency=frequency)
            db.add(topic)
            db.flush()
        topics.append(topic)

    graph = nx.DiGraph()
    for topic in topics:
        graph.add_node(str(topic.id), label=topic.name, frequency=topic.frequency)
    # Co-occurrence makes a related edge. Earlier topic is a conservative prerequisite recommendation.
    for index, source in enumerate(topics):
        for target in topics[index + 1:index + 3]:
            if source.id == target.id:
                continue
            shared = sum(source.normalized_name in normalize_topic(c) and target.normalized_name in normalize_topic(c) for c in chunks)
            if shared:
                db.add(TopicRelationship(subject_id=subject_id, source_topic_id=source.id, target_topic_id=target.id,
                                         relationship_type="related", weight=min(1.0, 0.35 + shared * 0.15), evidence="co-occurs in uploaded material"))
                graph.add_edge(str(source.id), str(target.id))
            if index < 6 and source.frequency >= 1 and target.frequency >= 1:
                db.add(TopicRelationship(subject_id=subject_id, source_topic_id=source.id, target_topic_id=target.id,
                                         relationship_type="prerequisite", weight=0.45, evidence="appears earlier in the learning material"))
    db.commit()
    return {"topics": len(topics), "nodes": graph.number_of_nodes(), "edges": graph.number_of_edges()}


def prerequisite_topics(db: Session, subject_id: str, topic_id: str) -> list[Topic]:
    edge_ids = [row.source_topic_id for row in db.query(TopicRelationship).filter(
        TopicRelationship.subject_id == subject_id,
        TopicRelationship.target_topic_id == topic_id,
        TopicRelationship.relationship_type == "prerequisite",
    ).all()]
    return db.query(Topic).filter(Topic.id.in_(edge_ids)).all() if edge_ids else []


def refresh_question_mappings(db: Session, subject_id: str, question_document_id: str, question_rows: list[tuple[str, str]]) -> int:
    """Link question-bank chunks to discovered topics using visible phrase matches."""
    db.query(QuestionTopicMapping).filter(QuestionTopicMapping.document_id == question_document_id).delete()
    topics = db.query(Topic).filter(Topic.subject_id == subject_id).all()
    mappings = 0
    for chroma_id, question in question_rows:
        normalized_question = normalize_topic(question)
        matched = [topic for topic in topics if topic.normalized_name in normalized_question]
        for topic in matched[:3]:
            db.add(QuestionTopicMapping(subject_id=subject_id, document_id=question_document_id,
                                        question_chroma_id=chroma_id, question_preview=question[:240],
                                        topic_id=topic.id, confidence=0.8))
            mappings += 1
    db.commit()
    return mappings
