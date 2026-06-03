import { DatabaseSync } from 'node:sqlite';

// 1. Initialize Database (Creates an in-memory DB; replace with 'app.db' for a local file)
const db = new DatabaseSync(':memory:');

// Helper to execute schema changes
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Database initialized.');
}

// 2. CREATE: Insert a new user
function createUser(name, email) {
  const insertStmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
  try {
    const result = insertStmt.run(name, email);
    console.log(`\n[CREATE] User created with ID: ${result.lastInsertRowid}`);
    return result.lastInsertRowid;
  } catch (error) {
    console.error(`[CREATE ERROR] Failed to create user: ${error.message}`);
    return null;
  }
}

// 3. READ: Fetch users
function getAllUsers() {
  const selectAllStmt = db.prepare('SELECT * FROM users');
  const users = selectAllStmt.all();
  console.log('\n[READ] All Users:', users);
  return users;
}

function getUserById(id) {
  const selectOneStmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const user = selectOneStmt.get(id);
  console.log(`\n[READ] User with ID ${id}:`, user || 'Not Found');
  return user;
}

// 4. UPDATE: Modify user details
function updateUser(id, name, email) {
  const updateStmt = db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?');
  const result = updateStmt.run(name, email, id);
  if (result.changes > 0) {
    console.log(`\n[UPDATE] User with ID ${id} updated successfully.`);
  } else {
    console.log(`\n[UPDATE] No user found with ID ${id}.`);
  }
  return result.changes > 0;
}

// 5. DELETE: Remove a user
function deleteUser(id) {
  const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
  const result = deleteStmt.run(id);
  if (result.changes > 0) {
    console.log(`\n[DELETE] User with ID ${id} deleted successfully.`);
  } else {
    console.log(`\n[DELETE] No user found with ID ${id}.`);
  }
  return result.changes > 0;
}

// --- Execution Flow ---
function main() {
  initDatabase();

  // Test CREATE
  const user1Id = createUser('Alice Smith', 'alice@example.com');
  const user2Id = createUser('Bob Jones', 'bob@example.com');
  
  // Try creating a duplicate email to test error handling
  createUser('Alice Junior', 'alice@example.com');

  // Test READ (All)
  getAllUsers();

  // Test READ (One)
  getUserById(user1Id);

  // Test UPDATE
  updateUser(user1Id, 'Alice Vance', 'alice.vance@example.com');
  getUserById(user1Id); // Verify update

  // Test DELETE
  deleteUser(user2Id);
  getAllUsers(); // Verify deletion
}

main();
