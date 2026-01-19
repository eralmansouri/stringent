# Performance Characteristics

This document describes the performance characteristics of Stringent's runtime parser based on benchmarking analysis.

## Overview

Stringent's parser is designed for correctness and type safety first, with performance being adequate for typical DSL use cases. The parser uses a recursive descent approach with precedence climbing, which provides predictable performance characteristics.

## Benchmark Results

Benchmarks were run using Vitest's benchmark mode on a typical development machine. Results show operations per second (higher is better).

### Simple Literals

| Operation | Ops/sec | Mean Time |
|-----------|---------|-----------|
| Number literal (`42`) | ~31,600 | 0.032ms |
| Decimal number (`3.14159`) | ~13,400 | 0.075ms |
| Large number | ~7,000 | 0.143ms |
| String literal (double quotes) | ~11,100 | 0.090ms |
| String literal (single quotes) | ~11,100 | 0.090ms |
| Identifier | ~1,400 | 0.695ms |

### Binary Operations

| Operation | Ops/sec | Mean Time |
|-----------|---------|-----------|
| Simple addition (`1 + 2`) | ~27,900 | 0.036ms |
| Simple multiplication (`3 * 4`) | ~26,400 | 0.038ms |
| Simple exponentiation (`2 ** 8`) | ~21,000 | 0.048ms |
| Mixed precedence (`1 + 2 * 3`) | ~21,900 | 0.046ms |
| Complex mixed (`2 * 3 + 4 * 5`) | ~19,300 | 0.052ms |
| Three precedence levels | ~15,900 | 0.063ms |

### Chained Operations

| Chain Length | Ops/sec | Mean Time |
|--------------|---------|-----------|
| 5 elements | ~9,500 | 0.105ms |
| 10 elements | ~5,400 | 0.186ms |
| 20 elements | ~2,700 | 0.369ms |
| 50 elements | ~1,200 | 0.839ms |

### Nested Parentheses

| Nesting Depth | Ops/sec | Mean Time |
|---------------|---------|-----------|
| 5 levels | ~8,000 | 0.125ms |
| 10 levels | ~4,500 | 0.222ms |
| 20 levels | ~2,300 | 0.435ms |

### String Parsing

| Operation | Ops/sec | Mean Time |
|-----------|---------|-----------|
| Short string (5 chars) | ~11,000 | 0.091ms |
| Medium string (100 chars) | ~9,500 | 0.105ms |
| Long string (1000 chars) | ~5,500 | 0.182ms |
| String with escapes | ~10,500 | 0.095ms |

## Performance Characteristics

### Time Complexity

- **Single expression**: O(1) for literals, O(p) for binary operators where p is precedence levels
- **Chained operations**: O(n) linear scaling where n is number of operations
- **Nested parentheses**: O(d) linear scaling where d is nesting depth
- **String literals**: O(k) where k is string length (due to escape sequence processing)

### Space Complexity

- **AST construction**: O(n) where n is number of nodes in the expression
- **Grammar construction**: O(m) where m is number of defined operators

### Scaling Behavior

The parser exhibits **linear scaling** with expression complexity:

```
Expression Length vs Parse Time (addition chains):
5 elements:  0.105ms
10 elements: 0.186ms (1.77x longer, 2x elements)
20 elements: 0.369ms (1.98x longer, 2x elements)
50 elements: 0.839ms (2.27x longer, 2.5x elements)
```

This linear scaling means:
- Doubling expression length roughly doubles parse time
- Performance remains predictable for complex expressions
- No exponential blowup with nested constructs

## Optimization Notes

### Current Optimizations

1. **Precedence-based parsing**: Higher-precedence operators are tried first, reducing backtracking
2. **Short-circuit evaluation**: Pattern matching fails fast on first mismatch
3. **Grammar caching**: Grammar is built once per parser instance in `createParser()`
4. **Efficient tokenization**: Uses `@sinclair/parsebox` for low-level token parsing

### Potential Future Optimizations

1. **Grammar caching in parse()**: Currently `buildGrammar()` is called on each `parse()` call. Pre-computing and caching the grammar would provide a small speedup for repeated parsing with the same parser.

2. **String interning**: For repeated identifier parsing, string interning could reduce memory allocations.

3. **Compiled parser**: For static grammars, a compiled parser approach could improve performance significantly.

### When Performance Matters

For typical use cases (form validation rules, configuration expressions, simple DSLs), Stringent's performance is more than adequate:

- **1,000+ simple expressions per second**: Suitable for interactive use
- **Sub-millisecond parsing**: Fast enough for real-time validation
- **Predictable scaling**: No pathological cases with complex expressions

### When to Consider Alternatives

If you need to:
- Parse millions of expressions per second
- Handle extremely large expressions (1000+ operations)
- Minimize latency below microseconds

Consider:
- A compiled parser generator (ANTLR, PEG.js)
- Hand-written recursive descent for your specific grammar
- WebAssembly-based parsers

## Running Benchmarks

To run the performance benchmarks yourself:

```bash
pnpm bench
```

This will run all benchmarks in `src/performance.bench.ts` and output detailed statistics including:
- Operations per second (hz)
- Minimum, maximum, and mean execution times
- Percentile values (p75, p99, p995, p999)
- Relative margin of error (rme)

## Benchmark Environment

For reproducible results, benchmarks should be run:
- On a quiet machine (no background processes)
- With Node.js in production mode
- Multiple times to account for JIT warmup
- With consistent hardware/OS conditions
