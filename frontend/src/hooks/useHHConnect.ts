"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

export type JobStatus =
  | "idle"
  | "running"
  | "captcha_required"
  | "code_required"
  | "success"
  | "failed";

type ConnectResponse = { job_id: string; status: JobStatus };
type JobStatusResponse = {
  job_id: string;
  status: JobStatus;
  screenshot_url: string | null;
  error: string | null;
};

export function useHHConnect() {
  const [phase, setPhase] = useState<JobStatus>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(
    (id: string) => {
      stopPoll();
      pollRef.current = setInterval(async () => {
        try {
          const data = await apiFetch<JobStatusResponse>(
            `/api/hh/connect/${id}`,
          );
          setPhase(data.status);
          setScreenshotUrl(data.screenshot_url);
          setError(data.error);
          if (data.status === "success" || data.status === "failed") {
            stopPoll();
          }
        } catch (e) {
          stopPoll();
          setPhase("failed");
          setError(e instanceof Error ? e.message : "poll failed");
        }
      }, 2000);
    },
    [stopPoll],
  );

  const start = useCallback(
    async (username: string, password: string) => {
      setError(null);
      setSubmitting(true);
      try {
        const data = await apiFetch<ConnectResponse>("/api/hh/connect", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        setJobId(data.job_id);
        setPhase(data.status);
        poll(data.job_id);
      } catch (e) {
        setPhase("failed");
        setError(
          e instanceof ApiError ? e.message : "connect request failed",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [poll],
  );

  const startEmailCode = useCallback(
    async (email: string) => {
      setError(null);
      setSubmitting(true);
      try {
        const data = await apiFetch<ConnectResponse>("/api/hh/connect", {
          method: "POST",
          body: JSON.stringify({ username: email, login_method: "email_code" }),
        });
        setJobId(data.job_id);
        setPhase(data.status);
        poll(data.job_id);
      } catch (e) {
        setPhase("failed");
        setError(
          e instanceof ApiError ? e.message : "connect request failed",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [poll],
  );

  const submitCaptcha = useCallback(
    async (solution: string) => {
      if (!jobId) return;
      setSubmitting(true);
      setError(null);
      try {
        await apiFetch(`/api/hh/connect/${jobId}/captcha`, {
          method: "POST",
          body: JSON.stringify({ solution }),
        });
        setPhase("running");
        setScreenshotUrl(null);
        poll(jobId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "captcha submit failed");
      } finally {
        setSubmitting(false);
      }
    },
    [jobId, poll],
  );

  const submitEmailCode = useCallback(
    async (code: string) => {
      if (!jobId) return;
      setSubmitting(true);
      setError(null);
      try {
        await apiFetch(`/api/hh/connect/${jobId}/code`, {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        setPhase("running");
        poll(jobId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "code submit failed");
      } finally {
        setSubmitting(false);
      }
    },
    [jobId, poll],
  );

  const reset = useCallback(() => {
    stopPoll();
    setPhase("idle");
    setJobId(null);
    setScreenshotUrl(null);
    setError(null);
  }, [stopPoll]);

  useEffect(() => () => stopPoll(), [stopPoll]);

  return {
    phase,
    jobId,
    screenshotUrl,
    error,
    submitting,
    start,
    startEmailCode,
    submitCaptcha,
    submitEmailCode,
    reset,
  };
}
