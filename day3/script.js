
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

function searchNotes(word) {
  const term = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(term));
}

function longestNote() {
  if (notes.length === 0) return null;
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0;
    }
    counts[note.category]++;
  }
  return counts;
}

function getSummary() {
  const total = notes.length;
  if (total === 0) return "0 notes.";
  const word = total === 1 ? "note" : "notes";
  const parts = Object.entries(countByCategory()).map(
    ([category, count]) => `${count} ${category}`
  );
  return `${total} ${word}: ${parts.join(", ")}.`;
}

function isDuplicate(text) {
  const cleaned = text.trim().toLowerCase().replace(/\s+/g, " ");
  return notes.some(
    (note) => note.text.trim().toLowerCase().replace(/\s+/g, " ") === cleaned
  );
}

function addNote(text, category) {
  const cleaned = text.trim();
  const validCategories = ["personal", "work", "study"];

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Rejected: note must be 1-200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log(`Rejected: "${cleaned}" already exists.`);
    return false;
  }
  if (!validCategories.includes(category)) {
    console.log(
      `Rejected: category must be personal, work or study (got "${category}").`
    );
    return false;
  }

  const newId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id: newId, text: cleaned, category: category });
  console.log(`Added: "${cleaned}" (${category})`);
  return true;
}
console.log(searchNotes("milk")); 
console.log(searchNotes("MILK")); 
console.log(searchNotes("zzz")); 


console.log(longestNote()); 

console.log(countByCategory()); 


console.log(getSummary()); 

console.log(isDuplicate("call mum")); 
console.log(isDuplicate("  Call   mum  ")); 
console.log(isDuplicate("Walk the dog")); 

console.log(addNote("Walk the dog", "personal")); 
console.log(addNote("walk the dog", "personal")); // logs "Rejected: ... already exists.", then false
console.log(addNote("   ", "work")); // logs "Rejected: note must be 1-200 characters.", then false
console.log(addNote("a".repeat(201), "work")); // logs "Rejected: note must be 1-200 characters.", then false
console.log(addNote("Plan trip", "holiday")); // logs "Rejected: category must be ...", then false
console.log(getSummary()); // "6 notes: 3 personal, 2 study, 1 work."

// Edge case: empty array (keep this last, because it empties the data)
notes = [];
console.log(longestNote()); // null
console.log(getSummary()); // "0 notes."
