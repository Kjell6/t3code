import * as NodeAssert from "node:assert/strict";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { discoverLocalSkills, discoverLocalSlashCommands } from "./discoverLocalProviderSkills.ts";

const testLayer = NodeServices.layer;

it.layer(testLayer)("discoverLocalProviderSkills", (it) => {
  it.effect("discovers skills from directories containing SKILL.md", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-skills-" });
      const skillDir = path.join(root, "skill");
      const nextDir = path.join(skillDir, "next");
      const rememberDir = path.join(skillDir, "remember");

      yield* fileSystem.makeDirectory(nextDir, { recursive: true });
      yield* fileSystem.makeDirectory(rememberDir, { recursive: true });

      yield* fileSystem.writeFileString(
        path.join(nextDir, "SKILL.md"),
        "---\ndescription: Continue with the next step\n---\n# Next Step\n",
      );
      yield* fileSystem.writeFileString(
        path.join(rememberDir, "SKILL.md"),
        "# Remember\nKeep context in mind.\n",
      );

      const skills = yield* discoverLocalSkills([skillDir]);

      NodeAssert.equal(skills.length, 2);
      NodeAssert.equal(skills[0]?.name, "next");
      NodeAssert.equal(skills[0]?.path, path.join(nextDir, "SKILL.md"));
      NodeAssert.equal(skills[0]?.enabled, true);
      NodeAssert.equal(skills[0]?.description, "Continue with the next step");
      NodeAssert.equal(skills[0]?.displayName, "Next Step");
      NodeAssert.equal(skills[1]?.name, "remember");
      NodeAssert.equal(skills[1]?.displayName, "Remember");
    }),
  );

  it.effect("ignores missing directories", () =>
    Effect.gen(function* () {
      const skills = yield* discoverLocalSkills(["/nonexistent/path/to/opencode/skill"]);

      NodeAssert.deepEqual(skills, []);
    }),
  );

  it.effect("deduplicates skills by name across directories", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-skills-dedup-" });
      const userDir = path.join(root, "user");
      const projectDir = path.join(root, "project");

      yield* fileSystem.makeDirectory(path.join(userDir, "next"), { recursive: true });
      yield* fileSystem.makeDirectory(path.join(projectDir, "next"), { recursive: true });

      yield* fileSystem.writeFileString(path.join(userDir, "next", "SKILL.md"), "# Next\n");
      yield* fileSystem.writeFileString(path.join(projectDir, "next", "SKILL.md"), "# Next\n");

      const skills = yield* discoverLocalSkills([userDir, projectDir]);

      NodeAssert.equal(skills.length, 1);
      NodeAssert.equal(skills[0]?.name, "next");
    }),
  );

  it.effect("discovers slash commands from .md files", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-commands-" });
      const commandDir = path.join(root, "command");

      yield* fileSystem.makeDirectory(commandDir, { recursive: true });
      yield* fileSystem.writeFileString(
        path.join(commandDir, "distill.md"),
        "---\ndescription: Distill the conversation\n---\n# Distill\n",
      );

      const commands = yield* discoverLocalSlashCommands([commandDir]);

      NodeAssert.equal(commands.length, 1);
      NodeAssert.equal(commands[0]?.name, "distill");
      NodeAssert.equal(commands[0]?.description, "Distill the conversation");
    }),
  );
});
