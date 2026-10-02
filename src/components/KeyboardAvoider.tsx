'use client';
// Mounts the app-wide keyboard handling (lib/keyboard.ts) once, from the root
// layout, so every text field on every screen is covered. Renders nothing.
import { useEffect } from 'react';
import { startKeyboardAvoidance } from '@/lib/keyboard';

export default function KeyboardAvoider() {
  useEffect(() => startKeyboardAvoidance(), []);
  return null;
}
