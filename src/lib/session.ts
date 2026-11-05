import { analysisOutputSchema, type AnalysisInput, type ReviewPacket } from "./contract";

export type EventSession = {
  event: AnalysisInput["snapshot"]["event"];
  status: "idle" | "analyzing" | "review-ready" | "error" | "approved" | "rejected";
  pending: { requestId: string; arrival: string | null } | null;
  review: ReviewPacket | null;
  error: string | null;
};

export function createSession(event: EventSession["event"]): EventSession {
  return { event: structuredClone(event), status: "idle", pending: null, review: null, error: null };
}

export function beginAnalysis(session: EventSession, arrival: string | null, requestId: string): EventSession {
  return { ...session, status: "analyzing", pending: { requestId, arrival }, review: null, error: null };
}

export function receiveAnalysis(session: EventSession, requestId: string, packet: ReviewPacket): EventSession {
  if (session.status !== "analyzing" || session.pending?.requestId !== requestId) return session;
  if (packet.proposed_arrival_time !== session.pending.arrival ||
      !analysisOutputSchema.safeParse(packet.analysis).success) {
    return failAnalysis(session, requestId, "The report does not match this proposed arrival.");
  }
  return { ...session, status: "review-ready", review: structuredClone(packet) };
}

export function failAnalysis(session: EventSession, requestId: string, message: string): EventSession {
  if (session.pending?.requestId !== requestId || session.status !== "analyzing") return session;
  return { ...session, status: "error", pending: null, review: null, error: message };
}

export function clearProposal(session: EventSession): EventSession {
  return { ...session, status: "idle", pending: null, review: null, error: null };
}

export function decide(session: EventSession, decision: "approve" | "reject"): EventSession {
  if (session.status !== "review-ready" || !session.pending || !session.review) {
    throw new Error("Analyze the proposed arrival successfully before deciding.");
  }
  // A missing proposed arrival can be analyzed (it is reported as unknown) but never applied,
  // because approving it would erase the vendor's current arrival time.
  if (decision === "approve" && session.pending.arrival === null) {
    throw new Error("Enter a proposed arrival time before approving.");
  }
  const event = structuredClone(session.event);
  if (decision === "approve") event.vendor.arrival_time = session.pending.arrival;
  return { event, status: decision === "approve" ? "approved" : "rejected",
    pending: null, review: null, error: null };
}
