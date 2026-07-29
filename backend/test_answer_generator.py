from app.services.answer_generator import generate_grounded_answer

test_evidence = [
    {
        "id": "library_002",
        "category": "library",
        "question": "When does the library close?",
        "answer": "Demo information: Library operating hours can vary by day and academic schedule. Students should verify the current library timings through official campus information.",
        "source": "Prototype demo data",
        "source_type": "unverified",
        "keywords": ["library", "timings", "hours", "close"],
    }
]

question = "When does the library close?"

answer = generate_grounded_answer(question, test_evidence)

print("\n--- GEMMA GROUNDED ANSWER ---")
print(answer)
print("-----------------------------")