// PasswordStrength.jsx - visual password strength indicator

import React, { useMemo } from 'react';

function calcStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 1) return { score, label: 'Very weak', color: '#ef4444' };
  if (score === 2) return { score, label: 'Weak',      color: '#f97316' };
  if (score === 3) return { score, label: 'Fair',      color: '#eab308' };
  if (score === 4) return { score, label: 'Strong',    color: '#22c55e' };
  return             { score: 5, label: 'Very strong', color: '#10b981' };
}

export default function PasswordStrength({ password }) {
  const { score, label, color } = useMemo(() => calcStrength(password), [password]);
  if (!password) return null;

  return (
    <div className="pwd-strength">
      <div className="pwd-bars">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className="pwd-bar"
            style={{ background: i <= score ? color : 'var(--border)' }}
          />
        ))}
      </div>
      <span className="pwd-label" style={{ color }}>{label}</span>
    </div>
  );
}
