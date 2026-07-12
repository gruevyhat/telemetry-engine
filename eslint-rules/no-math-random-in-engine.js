const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow Math.random in packages/engine; use a named seeded RNG stream instead",
    },
    schema: [],
    messages: {
      noMathRandom: "Math.random is banned in packages/engine. Use a named seeded RNG stream (Spec §6).",
    },
  },
  create() {
    return {};
  },
};

export default rule;
