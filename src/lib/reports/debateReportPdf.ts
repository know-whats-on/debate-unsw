"use client";

import type {
  AnalyticsSummary,
  Comment,
  Debate,
  Reaction,
  Reflection,
  Round,
  Student,
  Vote,
  VoteEvent,
} from "@/types";
import { computeDebateAwards, formatWinners } from "@/lib/analytics/awards";
import { parseLiteBlocks, tokenizeRich } from "@/lib/markdown/lite";

export interface DebateReportInput {
  debate: Debate;
  courseCode?: string;
  className?: string;
  rounds: Round[];
  students: Student[];
  votes: Vote[];
  voteEvents: VoteEvent[];
  comments: Comment[];
  reactions: Reaction[];
  reflections: Reflection[];
  summary: AnalyticsSummary | null;
}

const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_H - MARGIN - 16;

const COLORS = {
  ink: "#0b1c30",
  sub: "#464554",
  primary: "#4648d4",
  secondary: "#b90538",
  amber: "#fe9e20",
  line: "#c7c4d7",
  white: "#ffffff",
};

/**
 * jsPDF instance is `any`-typed here on purpose: importing the real type
 * would pull the whole module into the server bundle via type-checking of
 * this "use client" file, and jsPDF ships its own runtime type surface that
 * doesn't need re-declaring for the handful of drawing calls used below.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PDF = any;

class Writer {
  doc: PDF;
  y = MARGIN;
  page = 1;

  constructor(doc: PDF) {
    this.doc = doc;
    this.drawHeader();
  }

  private drawHeader() {
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text("Digital Jury", MARGIN, 32);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9);
    this.doc.setTextColor(COLORS.sub);
    this.doc.text("Instructor Report", PAGE_W - MARGIN, 32, { align: "right" });
    this.doc.setDrawColor(COLORS.line);
    this.doc.line(MARGIN, 40, PAGE_W - MARGIN, 40);
    this.y = 64;
  }

  private drawFooter() {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(COLORS.sub);
    this.doc.text(`Page ${this.page}`, PAGE_W / 2, PAGE_H - 28, { align: "center" });
  }

  /** Starts a brand-new report section on its own page. */
  section() {
    if (this.page > 1 || this.y > 64) {
      this.drawFooter();
      this.doc.addPage();
      this.page += 1;
      this.drawHeader();
    }
  }

  ensure(space: number) {
    if (this.y + space > BOTTOM_LIMIT) {
      this.drawFooter();
      this.doc.addPage();
      this.page += 1;
      this.drawHeader();
    }
  }

  finish() {
    this.drawFooter();
  }

  title(text: string) {
    this.ensure(30);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(20);
    this.doc.setTextColor(COLORS.ink);
    const lines = this.doc.splitTextToSize(text, CONTENT_W);
    for (const line of lines) {
      this.ensure(24);
      this.doc.text(line, MARGIN, this.y);
      this.y += 24;
    }
    this.y += 4;
  }

  heading(text: string) {
    this.ensure(22);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(13);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text(text, MARGIN, this.y);
    this.y += 18;
  }

  subheading(text: string) {
    this.ensure(16);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10.5);
    this.doc.setTextColor(COLORS.ink);
    const lines = this.doc.splitTextToSize(text, CONTENT_W);
    for (const line of lines) {
      this.ensure(14);
      this.doc.text(line, MARGIN, this.y);
      this.y += 14;
    }
  }

  body(text: string, opts: { color?: string; size?: number } = {}) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(opts.size ?? 10.5);
    this.doc.setTextColor(opts.color ?? COLORS.ink);
    const lines = this.doc.splitTextToSize(text, CONTENT_W);
    for (const line of lines) {
      this.ensure(14);
      this.doc.text(line, MARGIN, this.y);
      this.y += 14;
    }
    this.y += 4;
  }

  /** Word-wrapped paragraph honoring **bold** spans (manual wrap; jsPDF has no rich-text API). */
  richParagraph(text: string, indent = 0) {
    this.writeRich(text, MARGIN + indent, MARGIN + indent);
    this.y += 6;
  }

  bullet(text: string) {
    this.ensure(14);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10.5);
    this.doc.setTextColor(COLORS.primary);
    this.doc.text("•", MARGIN, this.y);
    this.writeRich(text, MARGIN + 14, MARGIN + 14);
    this.y += 6;
  }

  private writeRich(text: string, startX: number, wrapX: number) {
    const tokens = tokenizeRich(text);
    const maxX = PAGE_W - MARGIN;
    let x = startX;
    this.doc.setFontSize(10.5);
    this.ensure(14);
    for (const { word, bold } of tokens) {
      this.doc.setFont("helvetica", bold ? "bold" : "normal");
      this.doc.setTextColor(COLORS.ink);
      const piece = word + " ";
      const width = this.doc.getTextWidth(piece);
      if (x + width > maxX) {
        this.y += 14;
        this.ensure(14);
        x = wrapX;
      }
      this.doc.text(piece, x, this.y);
      x += width;
    }
    this.y += 14;
  }

  statBox(x: number, y: number, w: number, h: number, label: string, value: string, color: string) {
    this.doc.setFillColor(color);
    this.doc.roundedRect(x, y, w, h, 6, 6, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(17);
    this.doc.setTextColor(COLORS.white);
    this.doc.text(value, x + 14, y + 28);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.5);
    this.doc.text(label, x + 14, y + 44);
  }

  spacer(n = 10) {
    this.y += n;
  }
}

export async function downloadDebateReportPdf(data: DebateReportInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = new Writer(doc);

  renderCoverPage(w, data);
  w.section();
  renderAwardsPage(w, data);
  w.section();
  renderEngagementPage(w, data);
  w.section();
  renderVoicesPage(w, data);
  w.section();
  renderReflectionsPage(w, data);
  w.section();
  renderAiSummaryPages(w, data);

  w.finish();
  doc.save(`digital-jury-report-${slugify(data.debate.title)}.pdf`);
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "debate"
  );
}

function renderCoverPage(w: Writer, data: DebateReportInput) {
  const { debate, courseCode, className, students, votes, voteEvents, comments, reactions, reflections } = data;

  w.title(debate.title);
  const meta = [courseCode, className].filter(Boolean).join(" · ") || "Digital Jury debate";
  w.body(meta, { color: COLORS.sub });
  w.body(
    `Status: ${debate.status.toUpperCase()}   ·   Generated ${new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`,
    { color: COLORS.sub, size: 9 }
  );
  w.spacer(8);

  const joined = students.filter((s) => s.joined).length;
  const reflectionPct = joined === 0 ? 0 : Math.round((reflections.length / joined) * 100);

  w.heading("At a Glance");
  const boxes = [
    { label: "Students Joined", value: `${joined}/${students.length}`, color: COLORS.primary },
    { label: "Votes Cast", value: `${votes.length}`, color: COLORS.secondary },
    { label: "Vote Changes", value: `${voteEvents.length}`, color: COLORS.amber },
    { label: "Comments", value: `${comments.length}`, color: COLORS.primary },
    { label: "Reactions", value: `${reactions.length}`, color: COLORS.secondary },
    { label: "Reflections", value: `${reflectionPct}%`, color: COLORS.amber },
  ];
  const cols = 3;
  const gap = 12;
  const boxW = (CONTENT_W - gap * (cols - 1)) / cols;
  const boxH = 56;
  const rows = Math.ceil(boxes.length / cols);
  boxes.forEach((box, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    w.statBox(MARGIN + col * (boxW + gap), w.y + row * (boxH + gap), boxW, boxH, box.label, box.value, box.color);
  });
  w.y += rows * (boxH + gap) + 6;

  const forCount = votes.filter((v) => v.side === "for").length;
  const total = votes.length;
  const forPct = total === 0 ? 0 : Math.round((forCount / total) * 100);
  w.heading("Final Room Support");
  w.body(
    total === 0
      ? "No votes were cast."
      : `${debate.forLabel} ${forPct}%   ·   ${debate.againstLabel} ${100 - forPct}%   (${total} votes)`
  );
  if (total > 0) {
    const barH = 18;
    w.doc.setFillColor(COLORS.primary);
    w.doc.rect(MARGIN, w.y, (CONTENT_W * forPct) / 100, barH, "F");
    w.doc.setFillColor(COLORS.secondary);
    w.doc.rect(MARGIN + (CONTENT_W * forPct) / 100, w.y, (CONTENT_W * (100 - forPct)) / 100, barH, "F");
    w.y += barH + 14;
  }
}

function renderAwardsPage(w: Writer, data: DebateReportInput) {
  const { comments, students } = data;
  w.title("🏆 Debate Awards");
  w.body("A little recognition for the room's MVPs.", { color: COLORS.sub });
  w.spacer(6);

  const awards = computeDebateAwards(comments, students);
  const tiles = [
    {
      emoji: "📣",
      title: "Top Commentor",
      name: formatWinners(awards.topCommentors),
      detail: awards.topCommentors.length > 0 ? `${awards.topCommentorCount} comments` : "No comments yet",
      color: COLORS.primary,
    },
    {
      emoji: "❤️",
      title: "Most-Liked Comment",
      name: awards.mostLikedComment ? formatWinners(awards.mostLikedComment.authors) : "—",
      detail: awards.mostLikedComment ? `${awards.mostLikedComment.comment.likeCount} likes` : "No likes yet",
      color: COLORS.secondary,
    },
    {
      emoji: "🤫",
      title: "Silent Supporter",
      name: formatWinners(awards.silentSupporters),
      detail:
        awards.silentSupporters.length > 0
          ? `${awards.silentSupporterLikes} likes given, 0 comments`
          : "Everyone spoke up!",
      color: COLORS.amber,
    },
  ];

  const gap = 14;
  const boxW = (CONTENT_W - gap * 2) / 3;
  const boxH = 116;
  tiles.forEach((tile, i) => {
    const x = MARGIN + i * (boxW + gap);
    const y = w.y;
    w.doc.setDrawColor(tile.color);
    w.doc.setFillColor(COLORS.white);
    w.doc.roundedRect(x, y, boxW, boxH, 8, 8, "FD");
    w.doc.setFont("helvetica", "bold");
    w.doc.setFontSize(8.5);
    w.doc.setTextColor(COLORS.sub);
    w.doc.text(tile.title.toUpperCase(), x + boxW / 2, y + 20, { align: "center" });
    w.doc.setFontSize(20);
    w.doc.text(tile.emoji, x + boxW / 2, y + 46, { align: "center" });
    w.doc.setFont("helvetica", "bold");
    w.doc.setFontSize(10.5);
    w.doc.setTextColor(COLORS.ink);
    const nameLines = w.doc.splitTextToSize(tile.name, boxW - 16);
    w.doc.text(nameLines, x + boxW / 2, y + 66, { align: "center" });
    w.doc.setFont("helvetica", "normal");
    w.doc.setFontSize(7.5);
    w.doc.setTextColor(COLORS.sub);
    w.doc.text(tile.detail, x + boxW / 2, y + boxH - 10, { align: "center" });
  });
  w.y += boxH + 22;

  if (awards.mostLikedComment) {
    w.subheading("Winning comment");
    w.richParagraph(`"${awards.mostLikedComment.comment.text}"`);
  }
}

function renderEngagementPage(w: Writer, data: DebateReportInput) {
  const { rounds, comments, votes, voteEvents, debate, reactions } = data;
  w.title("Engagement Analytics");

  w.heading("Comments by Round");
  const roundCounts = rounds.map((r) => ({
    label: `R${r.index + 1}: ${r.title}`,
    count: comments.filter((c) => c.roundIndex === r.index).length,
  }));
  const maxCount = Math.max(1, ...roundCounts.map((r) => r.count));
  const barMaxW = CONTENT_W - 150;
  if (roundCounts.length === 0) {
    w.body("No rounds configured.", { color: COLORS.sub });
  }
  for (const r of roundCounts) {
    w.ensure(20);
    w.doc.setFont("helvetica", "normal");
    w.doc.setFontSize(9);
    w.doc.setTextColor(COLORS.ink);
    w.doc.text(r.label.slice(0, 30), MARGIN, w.y + 9);
    const barW = Math.max((r.count / maxCount) * barMaxW, r.count > 0 ? 3 : 0);
    w.doc.setFillColor(COLORS.primary);
    w.doc.rect(MARGIN + 150, w.y, barW, 12, "F");
    w.doc.setFontSize(9);
    w.doc.setTextColor(COLORS.sub);
    w.doc.text(`${r.count}`, MARGIN + 150 + barW + 6, w.y + 9.5);
    w.y += 20;
  }
  w.spacer(8);

  w.heading("Vote Timeline");
  const sorted = [...voteEvents].sort(
    (a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)
  );
  if (sorted.length === 0) {
    w.body("No votes were cast during this debate.", { color: COLORS.sub });
  } else {
    const sampleCount = Math.min(14, sorted.length);
    const step = Math.max(1, Math.floor(sorted.length / sampleCount));
    const current = new Map<string, "for" | "against">();
    let forC = 0;
    let againstC = 0;
    const points: number[] = [];
    sorted.forEach((ev, i) => {
      const prev = current.get(ev.studentDocId);
      if (prev === "for") forC--;
      if (prev === "against") againstC--;
      current.set(ev.studentDocId, ev.side);
      if (ev.side === "for") forC++;
      else againstC++;
      if (i % step === 0 || i === sorted.length - 1) {
        const t = forC + againstC;
        points.push(t === 0 ? 50 : (forC / t) * 100);
      }
    });
    const chartH = 90;
    w.ensure(chartH + 30);
    const chartY = w.y;
    w.doc.setDrawColor(COLORS.line);
    w.doc.rect(MARGIN, chartY, CONTENT_W, chartH);
    w.doc.setDrawColor(COLORS.primary);
    w.doc.setLineWidth(1.5);
    for (let i = 0; i < points.length - 1; i++) {
      const x1 = MARGIN + (CONTENT_W * i) / (points.length - 1);
      const x2 = MARGIN + (CONTENT_W * (i + 1)) / (points.length - 1);
      const y1 = chartY + chartH - (points[i] / 100) * chartH;
      const y2 = chartY + chartH - (points[i + 1] / 100) * chartH;
      w.doc.line(x1, y1, x2, y2);
    }
    w.doc.setLineWidth(1);
    w.y += chartH + 8;
    w.body(`Line shows ${debate.forLabel} support % over time (sampled).`, {
      color: COLORS.sub,
      size: 8.5,
    });
  }

  w.spacer(4);
  w.heading("Reactions");
  const reactionCounts = new Map<string, number>();
  for (const r of reactions) reactionCounts.set(r.type, (reactionCounts.get(r.type) ?? 0) + 1);
  if (reactionCounts.size === 0) {
    w.body("No reactions were sent.", { color: COLORS.sub });
  } else {
    w.body([...reactionCounts.entries()].map(([type, n]) => `${type} ×${n}`).join("     "));
  }
}

function renderVoicesPage(w: Writer, data: DebateReportInput) {
  const { comments, debate } = data;
  w.title("Top Voices");

  const topComments = [...comments]
    .filter((c) => c.status === "visible")
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 6);

  w.heading("Top-Liked Comments");
  if (topComments.length === 0) {
    w.body("No comments were posted.", { color: COLORS.sub });
  } else {
    for (const c of topComments) {
      w.ensure(40);
      const sideLabel =
        c.side === "for" ? debate.forLabel : c.side === "against" ? debate.againstLabel : "Neutral";
      w.subheading(`${c.studentName}  ·  ${sideLabel}  ·  ${c.likeCount} likes`);
      w.body(c.text);
    }
  }

  w.spacer(6);
  w.heading("Most Active Students");
  const counts = new Map<string, { name: string; count: number }>();
  for (const c of comments) {
    const entry = counts.get(c.studentDocId) ?? { name: c.studentName, count: 0 };
    entry.count++;
    counts.set(c.studentDocId, entry);
  }
  const mostActive = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  if (mostActive.length === 0) {
    w.body("No comments were posted.", { color: COLORS.sub });
  } else {
    mostActive.forEach((entry, i) => w.body(`${i + 1}. ${entry.name} — ${entry.count} comments`));
  }
}

function renderReflectionsPage(w: Writer, data: DebateReportInput) {
  const { reflections, students } = data;
  w.title("Reflection Insights");
  const joined = students.filter((s) => s.joined).length;
  const reflecting = new Set(reflections.map((r) => r.studentDocId)).size;
  const pct = joined === 0 ? 0 : Math.round((reflecting / joined) * 100);
  w.body(
    `${reflections.length} responses from ${reflecting} students (${pct}% of joined students). Reflections are private to the instructor.`,
    { color: COLORS.sub }
  );
  w.spacer(6);

  if (reflections.length === 0) {
    w.body("No reflections were submitted.");
    return;
  }
  w.heading("Sample Reflections");
  for (const r of reflections.slice(0, 5)) {
    w.ensure(48);
    w.subheading(
      r.promptText ? `${r.studentName} — ${r.promptText}` : r.studentName
    );
    w.richParagraph(`"${r.text}"`);
  }
}

function renderAiSummaryPages(w: Writer, data: DebateReportInput) {
  const { summary } = data;
  w.title("AI Engagement Summary");

  if (!summary) {
    w.body(
      "No AI summary has been generated for this debate yet. Generate one from the Analytics page before exporting for the full narrative.",
      { color: COLORS.sub }
    );
    return;
  }

  if (summary.keyThemes.length > 0) {
    w.heading("Key Themes");
    w.body(summary.keyThemes.join("   ·   "));
    w.spacer(4);
  }

  for (const block of parseLiteBlocks(summary.summary)) {
    if (block.type === "heading") w.heading(block.text);
    else if (block.type === "bullet") w.bullet(block.text);
    else w.richParagraph(block.text);
  }

  if (summary.highEngagementMoments.length > 0) {
    w.spacer(4);
    w.heading("High-Engagement Moments");
    for (const m of summary.highEngagementMoments) {
      w.bullet(`Round ${m.roundIndex + 1}: ${m.title} — ${m.description}`);
    }
  }

  if (summary.recommendations?.length > 0) {
    w.spacer(4);
    w.heading("Recommendations for Next Time");
    for (const rec of summary.recommendations) w.bullet(rec);
  }

  if (summary.limitations.length > 0) {
    w.spacer(4);
    w.heading("Cautions & Limitations");
    for (const c of summary.limitations) w.bullet(c);
  }
}
