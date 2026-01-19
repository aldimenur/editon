# Database Sync Feature

## Overview

The `sync_assets` function synchronizes the database with the actual files in a folder. This is useful when files are added, removed, or modified outside of the application.

## Features

- **Add new files**: Detects and adds files that exist in the folder but not in the database
- **Update modified files**: Updates file metadata (size) if the file has been modified
- **Remove deleted files**: Removes database entries for files that no longer exist in the folder
- **Transaction safety**: All operations are performed in a single database transaction

## Usage

### Backend (Rust)

```rust
#[tauri::command]
fn sync_assets(
    state: State<DbState>, 
    folder_path: String, 
    asset_type: String
) -> Result<SyncResult, String>
```

**Parameters:**
- `state`: Database state
- `folder_path`: Path to the folder to scan
- `asset_type`: Type of assets ("image", "video", "music", or "sound")

**Returns:**
```rust
pub struct SyncResult {
    added: usize,      // Number of new files added
    updated: usize,    // Number of existing files updated
    removed: usize,    // Number of deleted files removed
    total: usize,      // Total count after sync
}
```

### Frontend (TypeScript/React)

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { SyncResult } from "@/types/tauri";

const handleSync = async () => {
  try {
    const result = await invoke<SyncResult>("sync_assets", {
      folderPath: "/path/to/folder",
      assetType: "sound",
    });
    
    console.log(`Added: ${result.added}`);
    console.log(`Updated: ${result.updated}`);
    console.log(`Removed: ${result.removed}`);
    console.log(`Total: ${result.total}`);
  } catch (error) {
    console.error("Sync failed:", error);
  }
};
```

## How It Works

1. **Scan the folder**: Recursively scans the specified folder for files with valid extensions
2. **Compare with database**: 
   - For each scanned file, checks if it exists in the database
   - If not found, adds it (counts as "added")
   - If found but size changed, updates it (counts as "updated")
3. **Remove orphaned entries**: 
   - Checks all database entries
   - Removes entries for files that no longer exist in the folder (counts as "removed")
4. **Return results**: Returns statistics about the sync operation

## Performance Considerations

- Uses a single database transaction for all operations
- Efficient HashSet lookup for checking file existence
- WAL mode enabled for better concurrent performance

## Example Scenarios

### Scenario 1: New files added to folder
- User adds 5 new sound files to the folder outside the app
- Runs sync
- Result: `added: 5, updated: 0, removed: 0`

### Scenario 2: Files deleted from folder
- User deletes 3 files from the folder
- Runs sync
- Result: `added: 0, updated: 0, removed: 3`

### Scenario 3: Files modified
- User replaces a file with a new version (different size)
- Runs sync
- Result: `added: 0, updated: 1, removed: 0`

### Scenario 4: Mixed changes
- User adds 2 files, deletes 1 file, and modifies 1 file
- Runs sync
- Result: `added: 2, updated: 1, removed: 1`

## UI Integration

The sync button is available in the SFX page:
- Displays a spinning icon while syncing
- Shows an alert with sync results
- Automatically reloads the first page after sync
- Disabled when no folder is selected or sync is in progress

## Type Definitions

TypeScript types are available in `src/types/tauri.ts`:

```typescript
export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}
```
