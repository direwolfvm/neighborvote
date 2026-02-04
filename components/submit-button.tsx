"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  idleText: string;
  pendingText: string;
  className?: string;
}

export function SubmitButton({
  idleText,
  pendingText,
  className = "btn"
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText : idleText}
    </button>
  );
}
