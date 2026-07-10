import * as NodeOS from "node:os";

import { type ServerProviderSkill, type ServerProviderSlashCommand } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/**
 * Expand a leading `~` in a path to the user's home directory.
 *
 * Spawned processes don't get shell expansion, so env vars like `~/.opencode`
 * would be passed verbatim. We expand here before any filesystem calls.
 */
function expandHomePath(value: string): string {
  if (!value) return value;
  if (value === "~") return NodeOS.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return NodeOS.homedir() + value.slice(1);
  }
  return value;
}

interface ParsedSkillMetadata {
  readonly title?: string;
  readonly description?: string;
}

function parseSkillMetadata(content: string): ParsedSkillMetadata {
  const lines = content.split(/\r?\n/);
  let inFrontmatter = false;
  let frontmatterSeparatorCount = 0;
  let title: string | undefined;
  let description: string | undefined;

  for (const line of lines) {
    // YAML frontmatter: lines between two `---` markers at the start.
    if (frontmatterSeparatorCount === 0 && line.trim() === "---") {
      inFrontmatter = true;
      frontmatterSeparatorCount = 1;
      continue;
    }
    if (inFrontmatter && line.trim() === "---") {
      inFrontmatter = false;
      frontmatterSeparatorCount = 2;
      continue;
    }

    if (inFrontmatter) {
      const descriptionMatch = /^description:\s*(.+)$/.exec(line);
      if (descriptionMatch && !description) {
        description = descriptionMatch[1]?.trim();
      }
      continue;
    }

    // First markdown heading becomes the title.
    const headingMatch = /^#\s+(.+)$/.exec(line);
    if (headingMatch && !title) {
      title = headingMatch[1]?.trim();
    }

    // Stop early once we have what we need.
    if (title && description) break;
  }

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  };
}

/**
 * Discover provider skills stored as directories containing a `SKILL.md` file.
 *
 * This is a workaround for providers that do not expose skills through a
 * protocol/API (like Codex/Claude do). Skills are discovered by scanning
 * well-known local directories, e.g.:
 *
 *   - ~/.opencode/skill/<name>/SKILL.md
 *   - ~/.config/opencode/skill/<name>/SKILL.md
 *
 * TODO: Remove this once upstream providers expose native skill discovery.
 */
export const discoverLocalSkills = Effect.fn("discoverLocalSkills")(function* (
  directories: ReadonlyArray<string>,
): Effect.fn.Return<ReadonlyArray<ServerProviderSkill>, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const skills: Array<ServerProviderSkill> = [];
  const seen = new Set<string>();

  for (const rawDir of directories) {
    const directory = expandHomePath(rawDir.trim());
    if (directory.length === 0) continue;

    const entries = yield* fileSystem
      .readDirectory(directory)
      .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));

    for (const entry of entries) {
      const skillPath = path.join(directory, entry, "SKILL.md");
      const exists = yield* fileSystem.exists(skillPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) continue;

      const name = entry.trim();
      if (name.length === 0 || seen.has(name)) continue;
      seen.add(name);

      const content = yield* fileSystem
        .readFileString(skillPath)
        .pipe(Effect.orElseSucceed(() => ""));
      const metadata = parseSkillMetadata(content);

      const skill: ServerProviderSkill = {
        name,
        path: skillPath,
        enabled: true,
        ...(metadata.title ? { displayName: metadata.title } : {}),
        ...(metadata.description ? { description: metadata.description } : {}),
      };

      skills.push(skill);
    }
  }

  return skills.toSorted((left, right) => left.name.localeCompare(right.name));
});

/**
 * Discover provider slash-commands stored as `.md` files in a directory.
 *
 * This mirrors the skill discovery but for flat command files, e.g.:
 *
 *   - ~/.config/opencode/command/<name>.md
 *
 * TODO: Remove this once upstream providers expose native command discovery.
 */
export const discoverLocalSlashCommands = Effect.fn("discoverLocalSlashCommands")(function* (
  directories: ReadonlyArray<string>,
): Effect.fn.Return<
  ReadonlyArray<ServerProviderSlashCommand>,
  never,
  FileSystem.FileSystem | Path.Path
> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const commands: Array<ServerProviderSlashCommand> = [];
  const seen = new Set<string>();

  for (const rawDir of directories) {
    const directory = expandHomePath(rawDir.trim());
    if (directory.length === 0) continue;

    const entries = yield* fileSystem
      .readDirectory(directory)
      .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));

    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;

      const commandPath = path.join(directory, entry);
      const name = entry.slice(0, -3).trim();
      if (name.length === 0 || seen.has(name)) continue;
      seen.add(name);

      const content = yield* fileSystem
        .readFileString(commandPath)
        .pipe(Effect.orElseSucceed(() => ""));
      const metadata = parseSkillMetadata(content);

      commands.push({
        name,
        ...(metadata.description ? { description: metadata.description } : {}),
      });
    }
  }

  return commands.toSorted((left, right) => left.name.localeCompare(right.name));
});
