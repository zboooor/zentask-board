export type Id = string | number;

export interface Task {
  id: Id;
  columnId: Id;
  content: string;
  completed: boolean;
}

export interface Idea {
  id: Id;
  columnId: Id;
  content: string;
  isAiGenerated?: boolean;
}

export interface Column {
  id: Id;
  title: string;
}
