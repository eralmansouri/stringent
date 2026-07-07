import { useMemo, useState } from "react";
import { createParser, defineNode, overlapping } from "stringent";

// Leaf nodes live at the HIGHEST precedence level; keyword-literal const
// nodes (true/false) must come before path(), or `true` parses as an
// identifier. Identifier-like const values match whole identifiers only.
const numberLit = defineNode({
  name: "num",
  precedence: 4,
  pattern: (p) => p.number(),
});
const stringLit = defineNode({
  name: "str",
  precedence: 4,
  pattern: (p) => p.string(['"', "'"]),
});
const trueLit  = defineNode({
  name: "true",
  precedence: 4,
  pattern: (p) => p.constVal("true").result("boolean").eval(() => true),
});
const falseLit = defineNode({
  name: "false",
  precedence: 4,
  pattern: (p) =>
    p
      .constVal("false")
      .result("boolean")
      .eval(() => false),
});
const variable = defineNode({
  name: "var",
  precedence: 4,
  pattern: (p) => p.path(),
});

const parens = defineNode({
  name: "parens",
  precedence: 4,
  pattern: (p) =>
    p
      .constVal("(")
      .expr().as("inner")
      .constVal(")")
      .result("inner")
      .eval(({ inner }) => inner()),
});

const eq = defineNode({
  name: "eq",
  precedence: 1,
  pattern: (p) =>
    p
      .operand().as("left")
      .constVal("==")
      .rest(overlapping("left")).as("right")
      .result("boolean")
      .eval(({ left, right }) => left() === right()),
});

const add = defineNode({
  name: "add",
  precedence: 2,
  pattern: (p) =>
    p
      .operand("number | string").as("left")
      .constVal("+")
      .operand("left").as("right")
      .result("left")
      .eval((b) => {
    const l = b.left(), r = b.right();
    return typeof l === "string" ? `${l}${String(r)}` : Number(l) + Number(r);
  }),
});

const mul = defineNode({
  name: "mul",
  precedence: 3,
  pattern: (p) =>
    p
      .operand("number").as("left")
      .constVal("*")
      .operand("number").as("right")
      .result("number")
      .eval(({ left, right }) => left() * right()),
});

const ternary = defineNode({
  name: "ternary",
  precedence: 0,
  pattern: (p) =>
    p
      .operand("boolean").as("cond")
      .constVal("?")
      .expr().as("then")
      .constVal(":")
      .rest("then").as("else")
      .result("then")
      .eval(({ cond, then, else: alt }) => (cond() ? then() : alt())),
});

const parser = createParser(
  [numberLit, stringLit, trueLit, falseLit, variable, parens, ternary, eq, add, mul] as const
);

const schema = {
  x: "number",
  user: { name: "string", age: "number" },
} as const;

const values = {
  x: 21,
  user: { name: "Ada", age: 36 },
};

const examples = [
  "x * 2",
  "x * 2 == 42 ? 'yes' : 'no'",
  "user.name + '!'",
  "(1 + 2) * 3",
  "user.age == x + 15",
  "true ? 'taken' : user.name",
  "1 + 'a'",
];

type Outcome =
  | { ok: true; value: unknown; ast: unknown }
  | { ok: false; message: string; position: number | null };

function run(input: string): Outcome {
  const parsed = parser.safeParse(input, schema);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.message, position: parsed.error.position };
  }
  try {
    const value = parser.evaluateAst(parsed.ast, values);
    return { ok: true, value, ast: parsed.ast };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), position: null };
  }
}

const mono = "var(--sl-font-system-mono, ui-monospace, monospace)";

const styles = {
  wrapper: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  input: {
    width: "100%",
    fontFamily: mono,
    fontSize: "1rem",
    padding: "0.6rem 0.8rem",
    borderRadius: "0.5rem",
    border: "1px solid var(--sl-color-gray-4)",
    background: "var(--sl-color-black)",
    color: "var(--sl-color-white)",
  },
  chipRow: { display: "flex", flexWrap: "wrap", gap: "0.4rem", margin: 0 },
  chip: {
    fontFamily: mono,
    fontSize: "0.8rem",
    padding: "0.2rem 0.6rem",
    borderRadius: "999px",
    border: "1px solid var(--sl-color-gray-4)",
    background: "var(--sl-color-gray-6)",
    color: "var(--sl-color-white)",
    cursor: "pointer",
  },
  panel: {
    fontFamily: mono,
    fontSize: "0.9rem",
    padding: "0.75rem 1rem",
    borderRadius: "0.5rem",
    border: "1px solid var(--sl-color-gray-4)",
    overflowX: "auto" as const,
    margin: 0,
  },
  caret: { whiteSpace: "pre" as const, display: "block" },
  label: {
    fontSize: "0.75rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--sl-color-gray-3)",
    marginBottom: "0.25rem",
  },
} satisfies Record<string, React.CSSProperties>;

export default function ExpressionPlayground() {
  const [input, setInput] = useState(examples[1]!);
  const outcome = useMemo(() => run(input), [input]);

  return (
    <div style={styles.wrapper}>
      <div>
        <div style={styles.label}>Expression</div>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-label="Expression to evaluate"
        />
      </div>

      <div style={styles.chipRow} role="list" aria-label="Example expressions">
        {examples.map((ex) => (
          <button key={ex} style={styles.chip} onClick={() => setInput(ex)} type="button">
            {ex}
          </button>
        ))}
      </div>

      <div>
        <div style={styles.label}>{outcome.ok ? "Result" : "Error"}</div>
        {outcome.ok ? (
          <pre style={{ ...styles.panel, borderColor: "var(--sl-color-green)", color: "var(--sl-color-green-high)" }}>
            {JSON.stringify(outcome.value)}{" "}
            <span style={{ color: "var(--sl-color-gray-3)" }}>({typeof outcome.value})</span>
          </pre>
        ) : (
          <pre style={{ ...styles.panel, borderColor: "var(--sl-color-red)", color: "var(--sl-color-red-high)" }}>
            {outcome.position !== null && (
              <>
                <span style={styles.caret}>{input}</span>
                <span style={styles.caret}>{" ".repeat(Math.min(outcome.position, input.length)) + "^"}</span>
              </>
            )}
            {outcome.message}
          </pre>
        )}
      </div>

      <div>
        <div style={styles.label}>Schema & values</div>
        <pre style={styles.panel}>
          {`schema = ${JSON.stringify(schema, null, 2)}\n\nvalues = ${JSON.stringify(values, null, 2)}`}
        </pre>
      </div>
    </div>
  );
}
