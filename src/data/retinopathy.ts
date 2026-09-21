// Validation results from the training notebook (731 held-out images),
// reordered from Keras' alphabetical class order into severity order.

export const classes = ["No DR", "Mild", "Moderate", "Severe", "Proliferative"] as const;
/** Column headers are narrow; the full names stay in rows, tooltips and the table. */
export const shortClasses = ["No DR", "Mild", "Moderate", "Severe", "Prolif."] as const;

/** Rows are the true class, columns the predicted class. */
export const confusion: number[][] = [
  [353, 4, 4, 0, 0],
  [4, 31, 37, 2, 0],
  [10, 10, 173, 6, 0],
  [0, 3, 33, 2, 0],
  [3, 8, 46, 2, 0],
];

export const perClass = [
  { name: "No DR", precision: 0.954, recall: 0.978, f1: 0.966, support: 361 },
  { name: "Mild", precision: 0.554, recall: 0.419, f1: 0.477, support: 74 },
  { name: "Moderate", precision: 0.59, recall: 0.869, f1: 0.703, support: 199 },
  { name: "Severe", precision: 0.167, recall: 0.053, f1: 0.08, support: 38 },
  { name: "Proliferative", precision: 0, recall: 0, f1: 0, support: 59 },
];
