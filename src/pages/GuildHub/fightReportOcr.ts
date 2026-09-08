export type FightReportRosterMember = {
  id: string;
  name: string;
};

export type FightReportScanProgress = {
  status: string;
  progress: number;
};

export type FightReportScanResult = {
  reportKind: "attack" | "defense" | "uncertain";
  opponentGuild: string;
  missingSectionFound: boolean;
  endAnchorFound: boolean;
  confirmedMemberIds: string[];
  confirmedNames: string[];
  unknownNames: string[];
  uncertainNames: string[];
  notices: string[];
};

type OcrBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type OcrWord = OcrBox & {
  text: string;
  confidence: number | null;
  lineKey: string;
};

type OcrLine = OcrBox & {
  text: string;
  words: OcrWord[];
  confidence: number | null;
};

type OcrPage = {
  width: number;
  height: number;
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const boxRight = (box: OcrBox) => box.left + box.width;

const boxBottom = (box: OcrBox) => box.top + box.height;

const boxCenterX = (box: OcrBox) => box.left + box.width / 2;

const unionBoxes = <T extends OcrBox>(boxes: T[]): OcrBox => {
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map(boxRight));
  const bottom = Math.max(...boxes.map(boxBottom));
  return { left, top, width: right - left, height: bottom - top };
};

const parseFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const simplifyForAnchors = (value: string) =>
  collapseWhitespace(
    value
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " "),
  );

const normalizePlayerName = (value: string) =>
  collapseWhitespace(
    value
      .normalize("NFKC")
      .replace(/\p{Cf}/gu, "")
      .replace(/\p{Z}+/gu, " ")
      .toLowerCase(),
  );

const unique = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizePlayerName(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const levenshteinDistance = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
};

const tokenMatches = (token: string, expected: string) => {
  if (token === expected) return true;
  if (token.length >= 4 && (token.startsWith(expected) || expected.startsWith(token))) return true;
  const tolerance = expected.length >= 8 ? 2 : 1;
  return levenshteinDistance(token, expected) <= tolerance;
};

const hasAnchorWords = (line: string, expectedWords: string[]) => {
  const tokens = line.split(" ").filter(Boolean);
  return expectedWords.every((word) => tokens.some((token) => tokenMatches(token, word)));
};

const isMissedStartAnchor = (line: string) =>
  hasAnchorWords(line, ["members", "not", "sign", "up"]) ||
  hasAnchorWords(line, ["mitglieder", "nicht", "teilgenommen", "haben"]);

const isSignedUpEndAnchor = (line: string) =>
  !line.includes(" not ") &&
  !line.includes(" nicht ") &&
  (hasAnchorWords(line, ["members", "signed", "up"]) ||
    hasAnchorWords(line, ["members", "sign", "up"]) ||
    hasAnchorWords(line, ["mitglieder", "teilgenommen", "haben"]));

const isDefenseAnchor = (line: string) =>
  hasAnchorWords(line, ["verteidigung", "gegen", "angreifer"]) ||
  hasAnchorWords(line, ["defense", "against", "attacker"]) ||
  hasAnchorWords(line, ["defence", "against", "attacker"]);

const isKnownHeading = (value: string) => {
  const line = simplifyForAnchors(value);
  return (
    isMissedStartAnchor(line) ||
    isSignedUpEndAnchor(line) ||
    isDefenseAnchor(line) ||
    hasAnchorWords(line, ["attack", "on"]) ||
    hasAnchorWords(line, ["angriff", "auf"])
  );
};

const isAttackAnchor = (line: string) =>
  hasAnchorWords(line, ["attack", "on"]) ||
  hasAnchorWords(line, ["angriff", "auf"]);

const cleanOpponentName = (value: string) => {
  const withoutTrailingSections = value
    .split(/members\s+that|mitglieder\s*,?\s*die|fight\s+\d|kampf\s+\d/i)[0]
    .replace(/[:|]+$/g, "");
  return collapseWhitespace(withoutTrailingSections);
};

const extractOpponentGuild = (lines: string[]) => {
  for (const line of lines) {
    const compact = collapseWhitespace(line);
    const english = compact.match(/\battack\s+on\s+(.+)/i);
    if (english?.[1]) return cleanOpponentName(english[1]);
    const german = compact.match(/\bangriff\s+auf\s+(.+)/i);
    if (german?.[1]) return cleanOpponentName(german[1]);
  }
  return "";
};

const stripLeadingIconArtifact = (value: string) => {
  const tokens = collapseWhitespace(value).split(" ");
  if (tokens.length < 2) return collapseWhitespace(value);

  const firstToken = tokens[0].replace(/[^\p{L}\p{N}]+/gu, "");
  if (!firstToken) return tokens.slice(1).join(" ");
  if (Array.from(firstToken).length === 1) return tokens.slice(1).join(" ");

  return collapseWhitespace(value);
};

const cleanMissingNameLine = (line: string) => {
  const cleaned = collapseWhitespace(
    stripLeadingIconArtifact(line)
      .replace(/\((?:level|stufe)\s*\d+\)/gi, "")
      .replace(/\b(?:level|stufe)\s*\d+\b/gi, "")
      .replace(/^[\s\d.)\u2022*\-\u2013\u2014:;|]+/u, "")
      .replace(/[|]+/g, " ")
      .replace(/[,;:]+$/g, ""),
  );

  if (!cleaned || isKnownHeading(cleaned)) return "";
  const simple = simplifyForAnchors(cleaned);
  if (!simple || /^\d+$/.test(simple)) return "";
  if (simple === "x") return "";
  if (["level", "stufe", "lvl", "rang", "rank"].some((word) => simple === word || simple.startsWith(`${word} `))) return "";
  if (simple.includes("signed up") || simple.includes("teilgenommen")) return "";
  return cleaned;
};

const parseTsvOcrLines = (tsv: string | null | undefined): { page: OcrPage; lines: OcrLine[] } | null => {
  if (!tsv) return null;
  const rows = tsv.split(/\r?\n/g).filter(Boolean);
  const standardHeader = [
    "level",
    "page_num",
    "block_num",
    "par_num",
    "line_num",
    "word_num",
    "left",
    "top",
    "width",
    "height",
    "conf",
    "text",
  ];
  const firstRow = rows.shift()?.split("\t") ?? [];
  const hasHeader = firstRow.includes("level") && firstRow.includes("text");
  const header = hasHeader ? firstRow : standardHeader;
  if (!hasHeader && firstRow.length) rows.unshift(firstRow.join("\t"));
  const columnIndex = new Map(header.map((column, index) => [column, index]));
  const read = (columns: string[], name: string) => columns[columnIndex.get(name) ?? -1] ?? "";
  const lineGroups = new Map<string, OcrWord[]>();
  let pageWidth = 0;
  let pageHeight = 0;

  rows.forEach((row) => {
    const columns = row.split("\t");
    const level = read(columns, "level");
    const left = parseFiniteNumber(read(columns, "left"));
    const top = parseFiniteNumber(read(columns, "top"));
    const width = parseFiniteNumber(read(columns, "width"));
    const height = parseFiniteNumber(read(columns, "height"));
    if (left == null || top == null || width == null || height == null) return;

    if (level === "1") {
      pageWidth = Math.max(pageWidth, width);
      pageHeight = Math.max(pageHeight, height);
    }

    const text = read(columns, "text").trim();
    if (level !== "5" || !text) return;

    const confidence = parseFiniteNumber(read(columns, "conf"));
    const lineKey = [
      read(columns, "page_num"),
      read(columns, "block_num"),
      read(columns, "par_num"),
      read(columns, "line_num"),
    ].join(":");
    const words = lineGroups.get(lineKey) ?? [];
    words.push({ text, left, top, width, height, confidence, lineKey });
    lineGroups.set(lineKey, words);
  });

  const lines = [...lineGroups.values()]
    .map((words) => {
      const sortedWords = [...words].sort((a, b) => a.left - b.left);
      const box = unionBoxes(sortedWords);
      const confidences = sortedWords
        .map((word) => word.confidence)
        .filter((confidence): confidence is number => confidence != null && confidence >= 0);
      return {
        ...box,
        text: collapseWhitespace(sortedWords.map((word) => word.text).join(" ")),
        words: sortedWords,
        confidence: confidences.length
          ? confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length
          : null,
      };
    })
    .filter((line) => line.text)
    .sort((a, b) => a.top - b.top || a.left - b.left);

  if (!pageWidth) pageWidth = Math.max(1, ...lines.map(boxRight));
  if (!pageHeight) pageHeight = Math.max(1, ...lines.map(boxBottom));
  if (!lines.length) return null;

  return { page: { width: pageWidth, height: pageHeight }, lines };
};

const isSameReportColumn = (line: OcrLine, anchor: OcrLine, page: OcrPage) => {
  const leftTolerance = Math.max(80, page.width * 0.08);
  const centerTolerance = Math.max(120, page.width * 0.12);
  const minRight = Math.min(boxRight(line), boxRight(anchor));
  const maxLeft = Math.max(line.left, anchor.left);
  const overlap = Math.max(0, minRight - maxLeft);
  const overlapRatio = overlap / Math.max(1, Math.min(line.width, anchor.width));

  return (
    Math.abs(line.left - anchor.left) <= leftTolerance ||
    Math.abs(boxCenterX(line) - boxCenterX(anchor)) <= centerTolerance ||
    overlapRatio >= 0.35
  );
};

const findNearestAttackHeader = (lines: OcrLine[], startLine: OcrLine, page: OcrPage) => {
  const maxDistance = Math.max(180, page.height * 0.22);
  return lines
    .filter((line) => {
      if (boxBottom(line) > startLine.top) return false;
      if (startLine.top - boxBottom(line) > maxDistance) return false;
      return isAttackAnchor(simplifyForAnchors(line.text)) && isSameReportColumn(line, startLine, page);
    })
    .sort((a, b) => boxBottom(b) - boxBottom(a))[0] ?? null;
};

const buildFightReportTextFromTsv = (tsv: string | null | undefined) => {
  const parsed = parseTsvOcrLines(tsv);
  if (!parsed) return null;

  const { page, lines } = parsed;
  const startLines = lines.filter((line) => isMissedStartAnchor(simplifyForAnchors(line.text)));
  const endLines = lines.filter((line) => isSignedUpEndAnchor(simplifyForAnchors(line.text)));
  if (!startLines.length || !endLines.length) return null;

  const candidates = startLines
    .flatMap((startLine) =>
      endLines
        .filter((endLine) => endLine.top > startLine.top && isSameReportColumn(endLine, startLine, page))
        .map((endLine) => ({
          startLine,
          endLine,
          score:
            endLine.top - startLine.top +
            Math.abs(endLine.left - startLine.left) * 2 +
            Math.abs(boxCenterX(endLine) - boxCenterX(startLine)),
        })),
    )
    .sort((a, b) => a.score - b.score);
  const selected = candidates[0];
  if (!selected) return null;

  const { startLine, endLine } = selected;
  const attackHeader = findNearestAttackHeader(lines, startLine, page);
  const sameColumnRight = Math.max(boxRight(startLine), boxRight(endLine)) + Math.max(160, page.width * 0.24);
  const nameColumnLeft = startLine.left + Math.max(28, page.width * 0.018);
  const outputLines: string[] = [];

  if (attackHeader) outputLines.push(attackHeader.text);
  outputLines.push(startLine.text);

  lines
    .filter((line) => line.top > boxBottom(startLine) && boxBottom(line) < endLine.top)
    .filter((line) => boxRight(line) >= nameColumnLeft && line.left <= sameColumnRight)
    .filter((line) => isSameReportColumn(line, startLine, page))
    .forEach((line) => {
      const lineText = collapseWhitespace(
        line.words
          .filter((word) => word.left >= nameColumnLeft && word.left <= sameColumnRight)
          .map((word) => word.text)
          .join(" "),
      );
      if (lineText) outputLines.push(lineText);
    });

  outputLines.push(endLine.text);
  return outputLines.join("\n");
};

const buildRosterIndex = (roster: FightReportRosterMember[]) => {
  const index = new Map<string, FightReportRosterMember[]>();
  roster.forEach((member) => {
    const key = normalizePlayerName(member.name);
    if (!key) return;
    const entries = index.get(key) ?? [];
    entries.push(member);
    index.set(key, entries);
  });
  return index;
};

const removeSingleTokenPrefix = (name: string) => {
  const [prefixToken, ...remainingTokens] = collapseWhitespace(name).split(" ");
  if (!prefixToken || !remainingTokens.length) return null;
  if (Array.from(prefixToken).length !== 1) return null;
  const remainingName = remainingTokens.join(" ");
  return normalizePlayerName(remainingName) ? remainingName : null;
};

const isClearArtifactPrefix = (prefix: string, rosterName: string) => {
  const compactPrefix = normalizePlayerName(prefix).replace(/\s+/g, "");
  if (!compactPrefix) return false;

  const prefixLength = Array.from(compactPrefix).length;
  if (prefixLength > 3) return false;

  const isLettersOnly = /^\p{L}+$/u.test(compactPrefix);
  if (isLettersOnly && prefixLength > 2) return false;
  if (isLettersOnly && prefixLength > 1 && !rosterName.includes(" ")) return false;

  return true;
};

const hasSuffixBoundary = (value: string, suffixStart: number) => {
  if (suffixStart <= 0) return false;
  const prefixChars = Array.from(value.slice(0, suffixStart));
  const boundary = prefixChars[prefixChars.length - 1] ?? "";
  return /[\s\p{Z}\p{P}\p{S}\p{N}]/u.test(boundary);
};

const findSuffixRosterMatch = (name: string, rosterIndex: Map<string, FightReportRosterMember[]>) => {
  const normalizedName = normalizePlayerName(name);
  const candidates: FightReportRosterMember[] = [];

  rosterIndex.forEach((members, rosterName) => {
    if (!normalizedName.endsWith(rosterName) || normalizedName === rosterName) return;

    const suffixStart = normalizedName.length - rosterName.length;
    if (!hasSuffixBoundary(normalizedName, suffixStart)) return;
    if (!isClearArtifactPrefix(normalizedName.slice(0, suffixStart), rosterName)) return;

    candidates.push(...members);
  });

  if (candidates.length === 1) return { status: "confirmed" as const, member: candidates[0] };
  if (candidates.length > 1) return { status: "uncertain" as const };
  return { status: "unknown" as const };
};

const findRosterMatch = (name: string, rosterIndex: Map<string, FightReportRosterMember[]>) => {
  const directMatches = rosterIndex.get(normalizePlayerName(name)) ?? [];
  if (directMatches.length === 1) return { status: "confirmed" as const, member: directMatches[0] };
  if (directMatches.length > 1) return { status: "uncertain" as const };

  const withoutPrefix = removeSingleTokenPrefix(name);
  if (withoutPrefix) {
    const prefixlessMatches = rosterIndex.get(normalizePlayerName(withoutPrefix)) ?? [];
    if (prefixlessMatches.length === 1) return { status: "confirmed" as const, member: prefixlessMatches[0] };
    if (prefixlessMatches.length > 1) return { status: "uncertain" as const };
  }

  return findSuffixRosterMatch(name, rosterIndex);
};

export const parseFightReportText = (text: string, roster: FightReportRosterMember[]): FightReportScanResult => {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const simplifiedLines = lines.map(simplifyForAnchors);
  const hasDefense = simplifiedLines.some(isDefenseAnchor);
  const opponentGuild = hasDefense ? "" : extractOpponentGuild(lines);
  const missingStartIndex = simplifiedLines.findIndex(isMissedStartAnchor);
  const missingEndIndex =
    missingStartIndex >= 0
      ? simplifiedLines.findIndex((line, index) => index > missingStartIndex && isSignedUpEndAnchor(line))
      : -1;
  const reportKind: FightReportScanResult["reportKind"] = hasDefense
    ? "defense"
    : opponentGuild
      ? "attack"
      : "uncertain";
  const notices: string[] = [];

  if (hasDefense) {
    notices.push("Defense-Report erkannt - aktuell noch nicht unterstuetzt.");
  }
  if (!hasDefense && !opponentGuild) {
    notices.push("Gegnergilde konnte nicht sicher erkannt werden.");
  }
  if (missingStartIndex < 0) {
    notices.push("Abschnitt mit fehlenden Mitgliedern wurde nicht erkannt.");
  }
  if (missingStartIndex >= 0 && missingEndIndex < 0) {
    notices.push("Ende des Missing-Abschnitts wurde nicht sicher erkannt.");
  }

  if (hasDefense || missingStartIndex < 0 || missingEndIndex < 0) {
    return {
      reportKind,
      opponentGuild,
      missingSectionFound: missingStartIndex >= 0,
      endAnchorFound: missingEndIndex >= 0,
      confirmedMemberIds: [],
      confirmedNames: [],
      unknownNames: [],
      uncertainNames: [],
      notices,
    };
  }

  const rosterIndex = buildRosterIndex(roster);
  const names = unique(lines.slice(missingStartIndex + 1, missingEndIndex).map(cleanMissingNameLine).filter(Boolean));
  const confirmedMemberIds: string[] = [];
  const confirmedNames: string[] = [];
  const unknownNames: string[] = [];
  const uncertainNames: string[] = [];

  names.forEach((name) => {
    const match = findRosterMatch(name, rosterIndex);
    if (match.status === "confirmed") {
      confirmedMemberIds.push(match.member.id);
      confirmedNames.push(match.member.name);
    } else if (match.status === "uncertain") {
      uncertainNames.push(name);
    } else {
      unknownNames.push(name);
    }
  });

  if (!confirmedMemberIds.length && !unknownNames.length && !uncertainNames.length) {
    notices.push("Keine verwertbaren fehlenden Mitglieder erkannt.");
  }

  return {
    reportKind,
    opponentGuild,
    missingSectionFound: true,
    endAnchorFound: true,
    confirmedMemberIds,
    confirmedNames,
    unknownNames,
    uncertainNames,
    notices,
  };
};

export const scanFightReportScreenshot = async (
  file: File,
  roster: FightReportRosterMember[],
  onProgress?: (progress: FightReportScanProgress) => void,
) => {
  const { PSM, createWorker } = await import("tesseract.js");
  const worker = await createWorker(["deu", "eng", "ces", "pol", "slk", "hun"], 1, {
    logger: (message) => {
      onProgress?.({
        status: message.status,
        progress: Number.isFinite(message.progress) ? message.progress : 0,
      });
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });
    const result = await worker.recognize(file, {}, { text: true, tsv: true });
    const reportText = buildFightReportTextFromTsv(result.data.tsv) ?? result.data.text;
    return parseFightReportText(reportText, roster);
  } finally {
    await worker.terminate();
  }
};
