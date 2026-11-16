/**
 * The computer provider seam. Everything the app needs from a cloud computer goes
 * through this interface, so the service behind it can be swapped with COMPUTE_PROVIDER
 * without touching the agent loop, the routes or the viewer.
 */

export class ComputeError extends Error {
  constructor(public status: number, public code: string | undefined, message: string, public body?: unknown) {
    super(message);
  }
}

export interface Computer {
  id: string;
  instance_id?: string;
  /** running | creating | starting | suspending | suspended | resuming | frozen | stopped | error */
  status: string;
  name: string;
  resolution?: string;
  vnc_password?: string | null;
  asleep?: { where: 'host' | 'storage'; waking?: { expected_seconds?: number } } | null;
}

export interface Screen { id: string; display: string; width: number; height: number; default: boolean }

export interface Capabilities {
  /**
   * How many separate desktops one computer can hold. 1 means the provider has no
   * extra screens: every Bot of a user then shares the computer's one desktop.
   */
  maxScreens: number;
  /** Whether a computer can be put to sleep and woken later with its state kept. */
  suspend: boolean;
  /** Whether exportFile() is available (the Library download button). */
  fileExport: boolean;
}

/** Where the viewer relay connects: a websockify endpoint speaking RFB, and its VNC password. */
export interface VncUpstream { url: string; password: string; protocols?: string[] }

export interface ComputeProvider {
  readonly name: string;
  readonly capabilities: Capabilities;

  /** Workspaces (or projects) the key can create computers in. Providers without the concept return []. */
  workspaces(): Promise<{ id: string }[]>;

  createComputer(opts: { name: string; idempotencyKey: string; workspaceId?: string }): Promise<Computer>;
  getComputer(id: string): Promise<Computer>;
  start(id: string): Promise<unknown>;
  resume(id: string): Promise<unknown>;
  suspend(id: string): Promise<unknown>;
  vncUpstream(id: string, screen?: string): Promise<VncUpstream>;

  listScreens(id: string): Promise<Screen[]>;
  createScreen(id: string): Promise<Screen>;
  getScreen(id: string, screen: string): Promise<Screen>;
  deleteScreen(id: string, screen: string): Promise<void>;

  screenshot(id: string, screen?: string): Promise<{ image: string; mime_type?: string; width: number; height: number }>;
  click(id: string, screen: string | undefined, b: { x: number; y: number; button?: string; double?: boolean }): Promise<unknown>;
  move(id: string, screen: string | undefined, b: { x: number; y: number }): Promise<unknown>;
  drag(id: string, screen: string | undefined, b: { start_x: number; start_y: number; end_x: number; end_y: number }): Promise<unknown>;
  type(id: string, screen: string | undefined, text: string): Promise<unknown>;
  /** X11 keysyms joined by "+", for example "ctrl+shift+t". */
  key(id: string, screen: string | undefined, key: string): Promise<unknown>;
  scroll(id: string, screen: string | undefined, b: { x: number; y: number; direction: 'up' | 'down'; amount: number }): Promise<unknown>;
  bash(id: string, screen: string | undefined, command: string, timeout?: number): Promise<{ success: boolean; output: string; exit_code: number }>;
  /** Copy a file off a running computer; returns a short-lived download URL. */
  exportFile(id: string, path: string): Promise<{ url?: string; file?: { id: string; url?: string; filename?: string }; [k: string]: unknown }>;
}
