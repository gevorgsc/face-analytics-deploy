"""GSC Activation Manager desktop application."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
import tkinter as tk
from tkinter import messagebox, ttk


class ActivationManager(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("GSC Activation Manager")
        self.geometry("720x590")
        self.minsize(650, 560)
        self.configure(bg="#0f172a")

        self.server_url = tk.StringVar(value="http://127.0.0.1:8090")
        self.admin_token = tk.StringVar(value=os.getenv("ACTIVATION_ADMIN_TOKEN", ""))
        self.customer = tk.StringVar()
        self.face_enabled = tk.BooleanVar(value=True)
        self.acs_enabled = tk.BooleanVar(value=True)
        self.perpetual = tk.BooleanVar(value=False)
        self.expiry_date = tk.StringVar(value=(date.today() + timedelta(days=365)).isoformat())
        self.max_activations = tk.IntVar(value=1)
        self.generated_code = tk.StringVar()
        self.status = tk.StringVar(value="Ready")

        self._styles()
        self._build()
        self.perpetual.trace_add("write", lambda *_: self._sync_expiry())
        self._sync_expiry()

    def _styles(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Root.TFrame", background="#0f172a")
        style.configure("Card.TFrame", background="#111827")
        style.configure("Title.TLabel", background="#0f172a", foreground="#f8fafc", font=("Segoe UI", 22, "bold"))
        style.configure("Sub.TLabel", background="#0f172a", foreground="#94a3b8", font=("Segoe UI", 10))
        style.configure("Field.TLabel", background="#111827", foreground="#cbd5e1", font=("Segoe UI", 10, "bold"))
        style.configure("Info.TLabel", background="#111827", foreground="#64748b", font=("Segoe UI", 9))
        style.configure("Status.TLabel", background="#0f172a", foreground="#38bdf8", font=("Segoe UI", 9))
        style.configure("TCheckbutton", background="#111827", foreground="#e2e8f0")
        style.map("TCheckbutton", background=[("active", "#111827")])
        style.configure("Primary.TButton", background="#2563eb", foreground="white", padding=(15, 9), font=("Segoe UI", 10, "bold"))
        style.map("Primary.TButton", background=[("active", "#1d4ed8")])
        style.configure("Secondary.TButton", background="#1e293b", foreground="#e2e8f0", padding=(12, 8))

    def _build(self) -> None:
        root = ttk.Frame(self, style="Root.TFrame", padding=28)
        root.pack(fill="both", expand=True)
        ttk.Label(root, text="GSC Activation Manager", style="Title.TLabel").pack(anchor="w")
        ttk.Label(
            root,
            text="Create short online activation codes. The client never receives the issuer key.",
            style="Sub.TLabel",
        ).pack(anchor="w", pady=(3, 20))

        card = ttk.Frame(root, style="Card.TFrame", padding=22)
        card.pack(fill="both", expand=True)
        card.columnconfigure(1, weight=1)

        self._entry(card, 0, "Activation server", self.server_url)
        self._entry(card, 1, "Admin token", self.admin_token, show="*")
        self._entry(card, 2, "Customer", self.customer)

        ttk.Label(card, text="Licensed modules", style="Field.TLabel").grid(row=3, column=0, sticky="nw", pady=11)
        modules = ttk.Frame(card, style="Card.TFrame")
        modules.grid(row=3, column=1, sticky="w", pady=9)
        ttk.Checkbutton(modules, text="Face Analytics Pro", variable=self.face_enabled).pack(side="left", padx=(0, 18))
        ttk.Checkbutton(modules, text="Access Controller", variable=self.acs_enabled).pack(side="left")

        ttk.Label(card, text="Validity", style="Field.TLabel").grid(row=4, column=0, sticky="nw", pady=11)
        validity = ttk.Frame(card, style="Card.TFrame")
        validity.grid(row=4, column=1, sticky="w", pady=9)
        ttk.Checkbutton(validity, text="Perpetual", variable=self.perpetual).pack(side="left", padx=(0, 15))
        self.expiry_entry = ttk.Entry(validity, textvariable=self.expiry_date, width=15)
        self.expiry_entry.pack(side="left")
        ttk.Label(validity, text="YYYY-MM-DD", style="Info.TLabel").pack(side="left", padx=7)

        ttk.Label(card, text="Activation limit", style="Field.TLabel").grid(row=5, column=0, sticky="w", pady=11)
        ttk.Spinbox(card, from_=1, to=1000, textvariable=self.max_activations, width=10).grid(row=5, column=1, sticky="w", pady=9)

        ttk.Label(card, text="Activation code", style="Field.TLabel").grid(row=6, column=0, sticky="w", pady=(22, 8))
        output = ttk.Frame(card, style="Card.TFrame")
        output.grid(row=6, column=1, sticky="ew", pady=(16, 8))
        output.columnconfigure(0, weight=1)
        code_entry = ttk.Entry(output, textvariable=self.generated_code, font=("Consolas", 16, "bold"), justify="center")
        code_entry.grid(row=0, column=0, sticky="ew")
        ttk.Button(output, text="Copy", style="Secondary.TButton", command=self._copy).grid(row=0, column=1, padx=(8, 0))

        actions = ttk.Frame(card, style="Card.TFrame")
        actions.grid(row=7, column=1, sticky="e", pady=(20, 0))
        ttk.Button(actions, text="Test Server", style="Secondary.TButton", command=self._test_server).pack(side="left", padx=5)
        ttk.Button(actions, text="Create Activation Code", style="Primary.TButton", command=self._create_code).pack(side="left", padx=(5, 0))
        ttk.Label(root, textvariable=self.status, style="Status.TLabel").pack(anchor="w", pady=(12, 0))

    def _entry(self, parent, row: int, label: str, variable: tk.StringVar, show: str | None = None) -> None:
        ttk.Label(parent, text=label, style="Field.TLabel").grid(row=row, column=0, sticky="w", pady=7, padx=(0, 16))
        ttk.Entry(parent, textvariable=variable, show=show).grid(row=row, column=1, sticky="ew", pady=7)

    def _sync_expiry(self) -> None:
        self.expiry_entry.configure(state="disabled" if self.perpetual.get() else "normal")

    def _request(self, path: str, method: str = "GET", payload: dict | None = None):
        base = self.server_url.get().strip().rstrip("/")
        token = self.admin_token.get().strip()
        if not base or not token:
            raise ValueError("Activation server URL and admin token are required")
        body = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            base + path,
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            try:
                detail = json.loads(exc.read().decode()).get("detail")
            except Exception:
                detail = None
            raise ValueError(str(detail or f"Server error {exc.code}")) from exc
        except urllib.error.URLError as exc:
            raise ValueError("Could not connect to activation server") from exc

    def _expiry_iso(self) -> str | None:
        if self.perpetual.get():
            return None
        try:
            parsed = datetime.strptime(self.expiry_date.get().strip(), "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("Expiry date must use YYYY-MM-DD") from exc
        return f"{parsed.isoformat()}T23:59:59+04:00"

    def _test_server(self) -> None:
        try:
            self._request("/admin/codes")
            self.status.set("Activation server connection is working")
            messagebox.showinfo("Connected", "Activation server connection is working.", parent=self)
        except Exception as exc:
            self.status.set(f"Error: {exc}")
            messagebox.showerror("Connection failed", str(exc), parent=self)

    def _create_code(self) -> None:
        modules = []
        if self.face_enabled.get():
            modules.append("face_analytics")
        if self.acs_enabled.get():
            modules.append("access_controller")
        try:
            result = self._request(
                "/admin/codes",
                method="POST",
                payload={
                    "customer": self.customer.get().strip(),
                    "modules": modules,
                    "expires_at": self._expiry_iso(),
                    "max_activations": int(self.max_activations.get()),
                },
            )
            self.generated_code.set(result["activation_code"])
            self.status.set(f"Activation code created for {result['customer']}")
            self._copy()
            messagebox.showinfo(
                "Activation code created",
                f"{result['activation_code']}\n\nThe code was copied to the clipboard.",
                parent=self,
            )
        except Exception as exc:
            self.status.set(f"Error: {exc}")
            messagebox.showerror("Code creation failed", str(exc), parent=self)

    def _copy(self) -> None:
        code = self.generated_code.get().strip()
        if not code:
            return
        self.clipboard_clear()
        self.clipboard_append(code)
        self.status.set("Activation code copied to clipboard")


if __name__ == "__main__":
    ActivationManager().mainloop()
