"""GSC License Manager desktop application."""

from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from license_admin import create_license_document


DEFAULT_KEY = Path.home() / ".gsc-license-issuer" / "private_key.pem"


def _safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-")
    return cleaned or "customer"


class LicenseManager(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("GSC License Manager")
        self.geometry("760x670")
        self.minsize(680, 620)
        self.configure(bg="#0f172a")

        self.key_path = tk.StringVar(value=str(DEFAULT_KEY) if DEFAULT_KEY.exists() else "")
        self.customer = tk.StringVar()
        self.installation_id = tk.StringVar()
        self.face_enabled = tk.BooleanVar(value=True)
        self.acs_enabled = tk.BooleanVar(value=True)
        self.perpetual = tk.BooleanVar(value=False)
        self.expiry_date = tk.StringVar(value=(date.today() + timedelta(days=365)).isoformat())
        self.status = tk.StringVar(value="Ready")
        self.generated_document: dict | None = None

        self._configure_styles()
        self._build()
        self.perpetual.trace_add("write", lambda *_: self._sync_expiry_state())
        self._sync_expiry_state()

    def _configure_styles(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Root.TFrame", background="#0f172a")
        style.configure("Card.TFrame", background="#111827")
        style.configure("Title.TLabel", background="#0f172a", foreground="#f8fafc", font=("Segoe UI", 22, "bold"))
        style.configure("Sub.TLabel", background="#0f172a", foreground="#94a3b8", font=("Segoe UI", 10))
        style.configure("Field.TLabel", background="#111827", foreground="#cbd5e1", font=("Segoe UI", 10, "bold"))
        style.configure("Info.TLabel", background="#111827", foreground="#64748b", font=("Segoe UI", 9))
        style.configure("Status.TLabel", background="#0f172a", foreground="#38bdf8", font=("Segoe UI", 9))
        style.configure("TCheckbutton", background="#111827", foreground="#e2e8f0", font=("Segoe UI", 10))
        style.map("TCheckbutton", background=[("active", "#111827")])
        style.configure("Primary.TButton", background="#2563eb", foreground="white", padding=(15, 9), font=("Segoe UI", 10, "bold"))
        style.map("Primary.TButton", background=[("active", "#1d4ed8")])
        style.configure("Secondary.TButton", background="#1e293b", foreground="#e2e8f0", padding=(12, 8))
        style.map("Secondary.TButton", background=[("active", "#334155")])

    def _build(self) -> None:
        root = ttk.Frame(self, style="Root.TFrame", padding=28)
        root.pack(fill="both", expand=True)

        ttk.Label(root, text="GSC License Manager", style="Title.TLabel").pack(anchor="w")
        ttk.Label(
            root,
            text="Generate installation-bound licenses for Face Analytics Pro and Access Controller.",
            style="Sub.TLabel",
        ).pack(anchor="w", pady=(3, 20))

        card = ttk.Frame(root, style="Card.TFrame", padding=22)
        card.pack(fill="both", expand=True)
        card.columnconfigure(1, weight=1)

        self._field(card, 0, "Private issuer key", self.key_path, browse=self._select_key)
        self._field(card, 1, "Customer", self.customer)
        self._field(card, 2, "Installation ID", self.installation_id)

        ttk.Label(card, text="Licensed modules", style="Field.TLabel").grid(row=3, column=0, sticky="nw", pady=(13, 5))
        module_frame = ttk.Frame(card, style="Card.TFrame")
        module_frame.grid(row=3, column=1, sticky="w", pady=(11, 5))
        ttk.Checkbutton(module_frame, text="Face Analytics Pro", variable=self.face_enabled).pack(side="left", padx=(0, 18))
        ttk.Checkbutton(module_frame, text="Access Controller", variable=self.acs_enabled).pack(side="left")

        ttk.Label(card, text="Validity", style="Field.TLabel").grid(row=4, column=0, sticky="nw", pady=(13, 5))
        validity = ttk.Frame(card, style="Card.TFrame")
        validity.grid(row=4, column=1, sticky="ew", pady=(11, 5))
        ttk.Checkbutton(validity, text="Perpetual license", variable=self.perpetual).pack(side="left", padx=(0, 18))
        self.expiry_entry = ttk.Entry(validity, textvariable=self.expiry_date, width=18)
        self.expiry_entry.pack(side="left")
        ttk.Label(validity, text="YYYY-MM-DD", style="Info.TLabel").pack(side="left", padx=8)

        ttk.Label(card, text="Generated license", style="Field.TLabel").grid(row=5, column=0, sticky="nw", pady=(18, 5))
        self.output = tk.Text(
            card,
            height=12,
            wrap="word",
            bg="#020617",
            fg="#cbd5e1",
            insertbackground="#f8fafc",
            relief="flat",
            padx=12,
            pady=10,
            font=("Consolas", 9),
        )
        self.output.grid(row=5, column=1, sticky="nsew", pady=(14, 5))
        card.rowconfigure(5, weight=1)

        buttons = ttk.Frame(card, style="Card.TFrame")
        buttons.grid(row=6, column=1, sticky="e", pady=(16, 0))
        ttk.Button(buttons, text="Clear", style="Secondary.TButton", command=self._clear).pack(side="left", padx=5)
        ttk.Button(buttons, text="Copy JSON", style="Secondary.TButton", command=self._copy).pack(side="left", padx=5)
        ttk.Button(buttons, text="Generate License", style="Primary.TButton", command=self._generate).pack(side="left", padx=(5, 0))

        ttk.Label(root, textvariable=self.status, style="Status.TLabel").pack(anchor="w", pady=(12, 0))

    def _field(self, parent, row: int, label: str, variable: tk.StringVar, browse=None) -> None:
        ttk.Label(parent, text=label, style="Field.TLabel").grid(row=row, column=0, sticky="w", pady=7, padx=(0, 16))
        holder = ttk.Frame(parent, style="Card.TFrame")
        holder.grid(row=row, column=1, sticky="ew", pady=7)
        holder.columnconfigure(0, weight=1)
        ttk.Entry(holder, textvariable=variable).grid(row=0, column=0, sticky="ew")
        if browse:
            ttk.Button(holder, text="Browse", style="Secondary.TButton", command=browse).grid(row=0, column=1, padx=(8, 0))

    def _select_key(self) -> None:
        selected = filedialog.askopenfilename(
            title="Select Ed25519 private issuer key",
            filetypes=[("PEM key", "*.pem"), ("All files", "*.*")],
        )
        if selected:
            self.key_path.set(selected)

    def _sync_expiry_state(self) -> None:
        self.expiry_entry.configure(state="disabled" if self.perpetual.get() else "normal")

    def _expiry_iso(self) -> str | None:
        if self.perpetual.get():
            return None
        raw = self.expiry_date.get().strip()
        try:
            parsed = datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("Expiry date must use YYYY-MM-DD") from exc
        return f"{parsed.isoformat()}T23:59:59+04:00"

    def _generate(self) -> None:
        modules = []
        if self.face_enabled.get():
            modules.append("face_analytics")
        if self.acs_enabled.get():
            modules.append("access_controller")

        try:
            document = create_license_document(
                private_key_path=Path(self.key_path.get().strip()),
                installation_id=self.installation_id.get().strip(),
                customer=self.customer.get(),
                modules=modules,
                expires_at=self._expiry_iso(),
            )
        except Exception as exc:
            messagebox.showerror("License generation failed", str(exc), parent=self)
            self.status.set(f"Error: {exc}")
            return

        default_name = f"{_safe_filename(self.customer.get())}-license.json"
        destination = filedialog.asksaveasfilename(
            title="Save license",
            initialfile=default_name,
            defaultextension=".json",
            filetypes=[("License JSON", "*.json")],
        )
        if not destination:
            self.status.set("Generation cancelled")
            return

        serialized = json.dumps(document, indent=2) + "\n"
        Path(destination).write_text(serialized, encoding="utf-8")
        self.generated_document = document
        self.output.delete("1.0", "end")
        self.output.insert("1.0", serialized)
        self.status.set(f"License created: {destination}")
        messagebox.showinfo("License created", f"License saved to:\n{destination}", parent=self)

    def _copy(self) -> None:
        text = self.output.get("1.0", "end").strip()
        if not text:
            messagebox.showinfo("Nothing to copy", "Generate a license first.", parent=self)
            return
        self.clipboard_clear()
        self.clipboard_append(text)
        self.status.set("License JSON copied to clipboard")

    def _clear(self) -> None:
        self.customer.set("")
        self.installation_id.set("")
        self.output.delete("1.0", "end")
        self.generated_document = None
        self.status.set("Ready")


if __name__ == "__main__":
    LicenseManager().mainloop()
