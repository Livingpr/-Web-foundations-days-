// ---------- 1. Select elements ----------
const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const list = document.querySelector("#users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

// ---------- 2. Data ----------
let users = []; // every loaded user; the filter reads from here

// ---------- 3. Render ----------
function renderUsers(usersToShow) {
  list.innerHTML = ""; // safe: contains no user text

  // Only say "no match" when users exist but none fit the filter
  if (usersToShow.length === 0 && users.length > 0) {
    const empty = document.createElement("li");
    empty.textContent = "No users match your filter.";
    list.appendChild(empty);
    return;
  }

  usersToShow.forEach((user) => {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const details = document.createElement("div");
    details.textContent =
      `${user.email} | ${user.address.city} | ${user.company.name}`;

    li.appendChild(name);
    li.appendChild(details);
    list.appendChild(li);
  });
}

// ---------- 4. Filter (no new request) ----------
function applyFilter() {
  const term = filterInput.value.trim().toLowerCase();
  const matches = users.filter((user) =>
    user.name.toLowerCase().includes(term)
  );
  renderUsers(matches);
}

// ---------- 5. Load from the API ----------
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    users = await response.json();
    applyFilter(); // respects any text already typed in the filter
    statusText.textContent = `Loaded ${users.length} users.`;
  } catch (error) {
    statusText.textContent = "Could not load users. Please try again.";
    console.error("Load failed:", error.message);
  } finally {
    loadBtn.disabled = false; // runs on success and on failure
  }
}

// ---------- 6. Events ----------
loadBtn.addEventListener("click", loadUsers);
filterInput.addEventListener("input", applyFilter);
