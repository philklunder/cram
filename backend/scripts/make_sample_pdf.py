"""Write a tiny single-page PDF of study text, for smoke-testing /v1/generate.

Pure stdlib — no reportlab. Not a general PDF writer; just enough for a test fixture.
"""

from __future__ import annotations

import sys
import zlib

LINES = [
    "Cellular Respiration - Study Notes",
    "",
    "Cellular respiration is how cells convert glucose into ATP, the energy",
    "currency of the cell. It has three main stages.",
    "",
    "1. Glycolysis occurs in the cytoplasm. One glucose molecule is split into",
    "two pyruvate molecules, producing a net of 2 ATP and 2 NADH.",
    "",
    "2. The Krebs cycle (citric acid cycle) runs in the mitochondrial matrix.",
    "Each pyruvate is oxidised, releasing CO2 and generating NADH, FADH2, and ATP.",
    "",
    "3. The electron transport chain is on the inner mitochondrial membrane.",
    "NADH and FADH2 donate electrons; oxygen is the final electron acceptor,",
    "forming water. This drives oxidative phosphorylation, the bulk of ATP yield.",
    "",
    "In total, aerobic respiration of one glucose yields roughly 30-32 ATP.",
    "Without oxygen, cells fall back on fermentation, regenerating NAD+ but",
    "producing far less ATP.",
]


def _escape(s: str) -> str:
    return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def build_pdf() -> bytes:
    text_ops = ["BT", "/F1 14 Tf", "54 760 Td", "18 TL"]
    for i, line in enumerate(LINES):
        if i:
            text_ops.append("T*")
        text_ops.append(f"({_escape(line)}) Tj")
    text_ops.append("ET")
    stream = "\n".join(text_ops).encode("latin-1")
    compressed = zlib.compress(stream)

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(compressed)
        + compressed
        + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"

    xref_pos = len(out)
    out += b"xref\n0 %d\n" % (len(objects) + 1)
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\n" % (len(objects) + 1)
    out += b"startxref\n%d\n%%%%EOF" % xref_pos
    return bytes(out)


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "sample_notes.pdf"
    with open(path, "wb") as f:
        f.write(build_pdf())
    print(f"wrote {path}")
