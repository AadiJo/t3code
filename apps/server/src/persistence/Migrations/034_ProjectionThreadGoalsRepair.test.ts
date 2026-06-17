import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

const resetToMigration32WithoutGoal = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* runMigrations({ toMigrationInclusive: 32 });
  yield* sql`
    DELETE FROM effect_sql_migrations
    WHERE migration_id > 32
  `;

  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  if (columns.some((column) => column.name === "goal_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      DROP COLUMN goal_json
    `;
  }
});

layer("034_ProjectionThreadGoalsRepair", (it) => {
  it.effect("adds goal_json when migration 33 was already recorded without the column", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* resetToMigration32WithoutGoal;
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name, created_at)
        VALUES (33, 'ProjectionThreadGoals', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `;

      yield* runMigrations({ toMigrationInclusive: 34 });

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      assert.isTrue(columns.some((column) => column.name === "goal_json"));
    }),
  );

  it.effect("adds goal_json when migration 34 was already recorded without the column", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* resetToMigration32WithoutGoal;
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name, created_at)
        VALUES (33, 'ProjectionThreadGoals', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `;
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name, created_at)
        VALUES (34, 'ProjectionThreadGoalsRepair', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `;

      yield* runMigrations({ toMigrationInclusive: 35 });

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      assert.isTrue(columns.some((column) => column.name === "goal_json"));
    }),
  );
});
