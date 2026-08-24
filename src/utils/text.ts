/**
 * Text + keyword processing utilities.
 *
 * These power deterministic ATS scoring. The goal is robust matching WITHOUT
 * ever inventing content: we only ever check whether a job's requirement is
 * verifiably supported by the user's own resume/profile text.
 */

export const STOPWORDS = new Set<string>([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "of", "to", "in",
  "on", "for", "with", "as", "by", "at", "from", "is", "are", "be", "was",
  "were", "will", "would", "should", "can", "could", "may", "might", "must",
  "this", "that", "these", "those", "you", "your", "we", "our", "they", "their",
  "it", "its", "he", "she", "his", "her", "who", "whom", "which", "what",
  "have", "has", "had", "do", "does", "did", "not", "no", "yes", "into", "out",
  "up", "down", "over", "under", "about", "than", "so", "such", "per", "via",
  "including", "etc", "using", "use", "used", "work", "working", "years", "year",
  "experience", "experienced", "strong", "excellent", "good", "ability",
  "responsibilities", "requirements", "preferred", "required", "plus", "role",
  "team", "teams", "candidate", "candidates", "position", "job", "company",
  "including", "across", "within", "will", "well", "high", "new", "one", "two",
]);

/** Canonicalization: many surface forms -> one canonical token. */
const CANONICAL: Record<string, string> = {
  js: "javascript",
  "java script": "javascript",
  ts: "typescript",
  "type script": "typescript",
  reactjs: "react",
  "react.js": "react",
  "react js": "react",
  nodejs: "node",
  "node.js": "node",
  "node js": "node",
  node: "node",
  nextjs: "next.js",
  "rest apis": "rest api",
  restful: "rest api",
  "restful api": "rest api",
  "restful apis": "rest api",
  "rest": "rest api",
  postgres: "postgresql",
  "postgre sql": "postgresql",
  "c sharp": "c#",
  csharp: "c#",
  "c plus plus": "c++",
  cpp: "c++",
  golang: "go",
  k8s: "kubernetes",
  ci: "ci/cd",
  cd: "ci/cd",
  "ci cd": "ci/cd",
  "ci-cd": "ci/cd",
  ml: "machine learning",
  ai: "artificial intelligence",
  aws: "aws",
  gcp: "google cloud",
  "amazon web services": "aws",
  tf: "terraform",
};

/** Known multi-word skills we always want to detect as phrases. */
export const KNOWN_PHRASES: string[] = [
  "machine learning", "deep learning", "artificial intelligence", "data science",
  "rest api", "graphql", "ci/cd", "unit testing", "integration testing",
  "test driven development", "object oriented", "google cloud", "microsoft azure",
  "project management", "product management", "agile", "scrum", "kanban",
  "natural language processing", "computer vision", "distributed systems",
  "system design", "microservices", "message queue", "event driven",
  "continuous integration", "continuous deployment", "version control",
  "design patterns", "data structures", "algorithms", "sql server",
  "spring boot", "node.js", "next.js", "react native", "amazon web services",
];

/**
 * A curated vocabulary of real skills/technologies. Used to keep "required
 * skills" precise so generic English words (e.g. "development", "modern") are
 * not mistaken for skills and wrongly reported as unverifiable requirements.
 * This is a heuristic aid, not an exhaustive list.
 */
export const SKILL_VOCAB = new Set<string>([
  // languages
  "javascript", "typescript", "python", "java", "go", "ruby", "php", "swift",
  "kotlin", "scala", "rust", "c", "c++", "c#", "sql", "bash", "r", "dart",
  // frontend
  "react", "angular", "vue", "svelte", "next.js", "redux", "html", "css",
  "sass", "tailwind", "webpack", "vite", "react native",
  // backend / frameworks
  "node", "express", "django", "flask", "spring boot", "rails", "laravel",
  "fastapi", ".net", "graphql", "rest api", "grpc", "microservices",
  // data / db
  "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "sql server",
  "kafka", "spark", "hadoop", "snowflake", "airflow", "dbt",
  // cloud / devops
  "aws", "azure", "google cloud", "docker", "kubernetes", "terraform",
  "ci/cd", "jenkins", "github actions", "ansible", "linux", "nginx",
  // practices / domains
  "git", "agile", "scrum", "kanban", "machine learning", "deep learning",
  "artificial intelligence", "data science", "nlp", "computer vision",
  "unit testing", "integration testing", "test driven development",
  "system design", "distributed systems", "design patterns", "algorithms",
  "data structures", "project management", "product management",
]);

/** Is a keyword a plausible skill (vocab, known phrase, or tech-symbol token)? */
export function isLikelySkill(keyword: string): boolean {
  const k = canonicalize(keyword);
  if (SKILL_VOCAB.has(k)) return true;
  if (KNOWN_PHRASES.includes(k)) return true;
  // Tech-symbol tokens (c++, c#, node.js, ci/cd) — but must contain a letter,
  // so numeric fragments like "5+" or "3.5" are never treated as skills.
  if (/[a-z]/.test(k) && /[+#./]/.test(k) && !/^\d/.test(k)) return true;
  return false;
}

export function canonicalize(token: string): string {
  const t = token.trim().toLowerCase();
  return CANONICAL[t] ?? t;
}

/** Lowercase, strip punctuation to spaces, collapse whitespace. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9+#./\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word tokens (length >= 2), stopwords removed, canonicalized. */
export function tokenize(input: string): string[] {
  const norm = normalizeText(input);
  const out: string[] = [];
  for (const rawTok of norm.split(" ")) {
    const tok = rawTok.replace(/^[-.]+|[-.]+$/g, "");
    if (tok.length < 2) continue;
    if (STOPWORDS.has(tok)) continue;
    out.push(canonicalize(tok));
  }
  return out;
}

/** Unique set of single-token + known-phrase keywords present in text. */
export function extractKeywordSet(input: string): Set<string> {
  const norm = " " + normalizeText(input) + " ";
  const set = new Set<string>();

  // Known multi-word phrases.
  for (const phrase of KNOWN_PHRASES) {
    if (norm.includes(" " + phrase + " ")) {
      set.add(canonicalize(phrase));
    }
  }
  // Single tokens.
  for (const tok of tokenize(input)) {
    set.add(tok);
  }
  return set;
}

/**
 * Extract candidate requirement keywords from a job description. Returns a
 * ranked, de-duplicated list favouring phrases and capitalized/tech-looking
 * tokens. This is heuristic but deterministic.
 */
export function extractJobKeywords(description: string, limit = 40): string[] {
  const norm = " " + normalizeText(description) + " ";
  const counts = new Map<string, number>();

  const bump = (k: string, weight = 1) => {
    const key = canonicalize(k);
    counts.set(key, (counts.get(key) ?? 0) + weight);
  };

  for (const phrase of KNOWN_PHRASES) {
    let idx = norm.indexOf(" " + phrase + " ");
    while (idx !== -1) {
      bump(phrase, 3);
      idx = norm.indexOf(" " + phrase + " ", idx + 1);
    }
  }

  for (const tok of tokenize(description)) {
    // Tech-ish tokens (contain symbol/number) get a small boost.
    const boost = /[+#./0-9]/.test(tok) ? 2 : 1;
    bump(tok, boost);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => k);
}

/** Parse "5+ years", "3-5 years", "minimum 4 years" -> number of years. */
export function parseYearsRequirement(text: string): number | undefined {
  const t = text.toLowerCase();
  const m =
    t.match(/(\d+)\s*\+?\s*(?:-|to)?\s*(\d+)?\s*years?/) ||
    t.match(/(\d+)\s*\+?\s*yrs?/);
  if (!m) return undefined;
  const a = m[1] ? Number(m[1]) : undefined;
  if (a === undefined || !Number.isFinite(a)) return undefined;
  return a;
}

/** Jaccard similarity of two keyword sets (0..1). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Split a block of text into sentence-ish / bullet lines. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n|(?<=[.;])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Does a bullet contain a measurable achievement (numbers, %, $, metrics)? */
export function hasMeasurableAchievement(bullet: string): boolean {
  return /\b\d+(\.\d+)?\s*(%|percent|x|k|m|bn|million|billion|users?|customers?|requests?|hours?|days?|weeks?|months?|\$|usd|inr|eur)\b/i.test(
    bullet,
  ) || /[$₹€£]\s?\d/.test(bullet) || /\b\d{2,}\b/.test(bullet);
}

/** Weak-verb / vague bullet heuristic. */
const WEAK_STARTERS = [
  "responsible for", "worked on", "helped", "assisted", "involved in",
  "participated in", "tasked with", "duties included",
];
export function isWeakBullet(bullet: string): boolean {
  const b = bullet.trim().toLowerCase();
  if (b.length < 12) return true;
  return WEAK_STARTERS.some((w) => b.startsWith(w));
}
