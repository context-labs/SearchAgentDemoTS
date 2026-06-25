export interface ScratchpadEntry {
  label: string;
  note: string;
  created_at: string;
}

/** Loose, schemaless plain-text scratchpad. Deliberately allows stale notes. */
export class Scratchpad {
  notes: ScratchpadEntry[] = [];

  write(note: string, label = "note"): ScratchpadEntry {
    const entry: ScratchpadEntry = {
      label: label.slice(0, 40),
      note: note.slice(0, 1200),
      created_at: new Date().toISOString(),
    };
    this.notes.push(entry);
    return entry;
  }

  read(limit = 10): ScratchpadEntry[] {
    const clamped = Math.max(1, Math.min(limit, 25));
    return this.notes.slice(-clamped);
  }
}

export interface SearchResultData {
  title: string;
  url: string;
  content: string;
  score: number | null;
  published_date: string | null;
}

export class SearchResult {
  constructor(
    public title: string,
    public url: string,
    public content: string,
    public score: number | null = null,
    public publishedDate: string | null = null,
  ) {}

  toDict(): SearchResultData {
    return {
      title: this.title,
      url: this.url,
      content: this.content,
      score: this.score,
      published_date: this.publishedDate,
    };
  }
}
