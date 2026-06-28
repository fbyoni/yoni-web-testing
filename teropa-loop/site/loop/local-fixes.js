// Ensure Open Sans is resident before any canvas widget draws its labels.
if (document.fonts && document.fonts.load) {
  try { document.fonts.load("16px 'Open Sans'"); } catch (e) {}
}
