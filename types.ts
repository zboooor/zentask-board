export type Id = string | number;

export interface Task {
  id: Id;
  recordId?: string;  // Feishu record ID for incremental sync
  columnId: Id;
  content: string;
  completed: boolean;
}

export interface Idea {
  id: Id;
  recordId?: string;  // Feishu record ID for incremental sync
  columnId: Id;
  content: string;
  isAiGenerated?: boolean;
}

export interface Column {
  id: Id;
  recordId?: string;  // Feishu record ID for incremental sync
  title: string;
  isEncrypted?: boolean;      // Whether this column is encrypted
  encryptionSalt?: string;    // Salt for password verification
}

export interface DocumentFolder {
  id: Id;
  recordId?: string;  // Feishu record ID for incremental sync
  title: string;
  isEncrypted?: boolean;      // Whether this folder is encrypted
  encryptionSalt?: string;    // Salt for password verification
}

export interface Document {
  id: Id;
  recordId?: string;  // Feishu record ID for incremental sync
  folderId?: Id;      // Optional folder ID (null = root level)
  title: string;
  content: string;
  createdAt?: number;
  updatedAt?: number;
  isEncrypted?: boolean;      // Whether this document is encrypted
  encryptionSalt?: string;    // Salt for password verification (format: salt:hash)
}
