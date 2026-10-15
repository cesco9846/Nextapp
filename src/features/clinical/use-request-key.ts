"use client";
import { useRef } from "react";
export function useRequestKey() {
  const attempt = useRef({ body: "", key: "" });
  return function withKey<T extends object>(body: T) {
    const serialized = JSON.stringify(body);
    if (attempt.current.body !== serialized)
      attempt.current = { body: serialized, key: crypto.randomUUID() };
    return { ...body, request_id: attempt.current.key };
  };
}
