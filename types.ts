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
}

export interface Document {
  id: Id;
  recordId?: string;  // Feishu record ID for incremental sync
  title: string;
  content: string;
  createdAt?: number;
  updatedAt?: number;
}
