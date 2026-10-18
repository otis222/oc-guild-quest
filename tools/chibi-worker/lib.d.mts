// lib.mjs 的型別（給 Vitest 測試和 tsc 用；程式本身是純 JavaScript，在組員的電腦用 Node.js 直接跑）

export declare const CODE_RE: RegExp;
export declare function isCode(v: unknown): v is string;
export declare function isObj(v: unknown): v is Record<string, unknown>;
export declare const KEY_MIN: number;
export declare const MAX_UPLOAD: number;
export declare const COMFY_SUBFOLDER: string;
export declare const MIME_OF: Readonly<Record<string, string>>;
export declare const EXT_OF: Readonly<Record<string, string>>;
export declare function extOf(name: string): string;

export interface WorkerConfig {
  inboxUrl: string;
  workerKey: string;
  comfyUrl: string;
  workflow: string;
  imageNode?: string;
  outputNode?: string;
  review: boolean;
  candidates: number;
  pollSeconds: number;
  timeoutMinutes: number;
}
export declare const DEFAULTS: Readonly<Pick<WorkerConfig, 'comfyUrl' | 'workflow' | 'review' | 'candidates' | 'pollSeconds' | 'timeoutMinutes'>>;
export declare function newKey(bytes: Uint8Array): string;
export declare function starterConfig(key: string): Record<string, unknown>;
export declare function parseConfig(raw: unknown, o?: { inbox?: boolean }):
  | { ok: true; config: WorkerConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export interface WorkflowNode { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }
export type Workflow = Record<string, WorkflowNode>;
export interface NodeInfo { id: string; title: string; classType: string }
export declare function readWorkflow(raw: unknown): { ok: true; workflow: Workflow } | { ok: false; error: string };
export declare function listNodes(w: Workflow): NodeInfo[];
export declare function describeNode(n: NodeInfo): string;
export declare function findImageNode(w: Workflow, wanted?: string): { ok: true; node: NodeInfo } | { ok: false; error: string };
export declare function findOutputNode(w: Workflow, wanted?: string):
  | { ok: true; node: NodeInfo | null; savers: NodeInfo[] }
  | { ok: false; error: string };
export declare function patchWorkflow(
  w: Workflow,
  o: { imageNode: string; image: string; prefix: string; rand?: () => number },
): Workflow;

export interface ImageRef { nodeId: string; filename: string; subfolder: string; type: string }
export type PromptState =
  | { state: 'running' }
  | { state: 'done'; images: ImageRef[] }
  | { state: 'error'; message: string };
export declare function historyState(history: unknown, id: string): PromptState;
export declare function inQueue(queue: unknown, id: string): boolean;
export declare function pickOutput(images: ImageRef[], nodeId?: string): ImageRef | null;
export declare function promptError(body: unknown): string;

export declare const INBOX_ERRORS: Readonly<Record<string, string>>;
export declare function parseInboxReply(text: string):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; message: string };
export interface PendingItem { code: string; name: string; note: string; requestedAt: number }
export declare function parsePending(data: unknown): { items: PendingItem[]; ready: string[] } | null;

export declare const INFO: string;
export declare const SENT: string;
export declare function isOcFile(f: string): boolean;
export type Step =
  | { step: 'redo' }
  | { step: 'download' }
  | { step: 'send'; file: string }
  | { step: 'generate'; count: number }
  | { step: 'wait'; count: number };
export declare function nextStep(files: string[], o: { review: boolean; candidates: number }): Step;
export declare function outputFiles(files: string[]): string[];
export declare function candidateName(files: string[], ext: string): string;
export declare function infoText(item: PendingItem, when: string): string;
export declare function label(item: PendingItem): string;
