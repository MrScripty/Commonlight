"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CameraController } from "@/lib/camera";
import {
  MAX_UPLOAD_BYTES,
  decodePublication,
  decodeResult,
} from "@/lib/contracts";
type Result = ReturnType<typeof decodeResult>;
async function checked(response: Response) {
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "The operation could not finish.",
    );
  return data;
}
export default function Studio() {
  const [consent, setConsent] = useState(false),
    [shareConsent, setShareConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState("");
  const [name, setName] = useState(""),
    [mark, setMark] = useState(false);
  const [camera, setCamera] = useState(false),
    [cameraPending, setCameraPending] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null),
    [link, setLink] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    controller = useRef(new CameraController());
  const request = useRef<AbortController | null>(null),
    generation = useRef(0),
    mounted = useRef(true),
    lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null),
    cameraGeneration = useRef(0),
    previewUrl = useRef("");
  function stopCamera() {
    cameraGeneration.current++;
    controller.current.stop();
    setCamera(false);
    setCameraPending(false);
  }
  useEffect(() => {
    mounted.current = true;
    const cameraOwner = controller.current;
    const onPageHide = () => {
      generation.current++;
      cameraGeneration.current++;
      cameraOwner.stop();
      request.current?.abort();
      lock.current = false;
      if (mounted.current) {
        setCamera(false);
        setCameraPending(false);
        setBusy(false);
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      mounted.current = false;
      onPageHide();
      URL.revokeObjectURL(previewUrl.current);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);
  useEffect(() => {
    if (result) heading.current?.focus();
  }, [result]);
  function choose(selected: File | null) {
    setError("");
    if (!selected) return;
    if (
      selected.size > MAX_UPLOAD_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(selected.type)
    ) {
      setError("Choose a JPEG, PNG or WebP up to 10 MB.");
      return;
    }
    stopCamera();
    URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(selected);
    setPreview(previewUrl.current);
    setFile(selected);
    setNotice(
      "Photo selected. Review the framing, then prepare your portrait.",
    );
  }
  async function openCamera() {
    if (!consent || cameraPending || camera || lock.current) return;
    setError("");
    setCameraPending(true);
    const current = ++cameraGeneration.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera capture needs a supported browser on localhost or HTTPS. You can upload a photo instead.",
        );
      const stream = await controller.current.open(() =>
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        }),
      );
      if (!stream || !mounted.current) return;
      setCamera(true);
      setCameraPending(false);
      // The video stays mounted, so permission completion never targets a stale element.
      if (video.current) {
        video.current.srcObject = stream;
        await video.current.play();
      }
    } catch (e) {
      if (mounted.current && current === cameraGeneration.current) {
        stopCamera();
        setError(
          e instanceof Error
            ? e.message
            : "Camera access was not granted. Upload a photo instead.",
        );
      }
    }
  }
  async function capture() {
    const element = video.current;
    if (!element?.videoWidth || !camera) {
      setError("Wait for the camera preview, then try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Camera capture is unavailable. Upload a photo instead.");
      return;
    }
    context.drawImage(element, 0, 0);
    const current = cameraGeneration.current;
    canvas.toBlob(
      (blob) => {
        if (blob && mounted.current && current === cameraGeneration.current)
          choose(new File([blob], "camera.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.95,
    );
  }
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const abort = new AbortController();
    request.current = abort;
    const current = ++generation.current;
    try {
      await action(abort.signal);
    } catch (e) {
      if (
        mounted.current &&
        current === generation.current &&
        !abort.signal.aborted
      )
        setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      if (current === generation.current) {
        lock.current = false;
        request.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }
  async function prepare() {
    if (!file || !consent) return;
    stopCamera();
    await run(async (signal) => {
      await checked(await fetch("/api/session", { method: "POST", signal }));
      const data = decodeResult(
        await checked(
          await fetch("/api/portraits", {
            method: "POST",
            headers: {
              "Content-Type": file.type,
              "X-Portrait-Options": encodeURIComponent(
                JSON.stringify({ consent, name, mark }),
              ),
            },
            body: file,
            signal,
          }),
        ),
      );
      if (!signal.aborted && mounted.current) {
        setResult(data);
        setLink("");
        setShareConsent(false);
        setNotice(
          "Your portrait is private. Review it before downloading or sharing.",
        );
      }
    });
  }
  function cancel() {
    generation.current++;
    request.current?.abort();
    request.current = null;
    lock.current = false;
    setBusy(false);
    stopCamera();
    setNotice(
      "Cancelled. An upload already completed on the server may remain private until the 24-hour expiry.",
    );
  }
  async function publish() {
    if (!result || !shareConsent) return;
    await run(async (signal) => {
      const data = decodePublication(
        await checked(
          await fetch(`/api/portraits/${result.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "publish", consent: shareConsent }),
            signal,
          }),
        ),
      );
      if (!signal.aborted && mounted.current) {
        setLink(`${location.origin}/gallery/${data.token}`);
        setNotice(
          "Link sharing is on. Anyone with the link can view and save this portrait.",
        );
      }
    });
  }
  async function revoke() {
    if (!result) return;
    await run(async (signal) => {
      await checked(
        await fetch(`/api/portraits/${result.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "revoke" }),
          signal,
        }),
      );
      if (!signal.aborted && mounted.current) {
        setLink("");
        setShareConsent(false);
        setNotice(
          "Link revoked. Previously downloaded copies cannot be recalled.",
        );
      }
    });
  }
  async function remove() {
    if (!result) return;
    await run(async (signal) => {
      await checked(
        await fetch(`/api/portraits/${result.id}`, {
          method: "DELETE",
          signal,
        }),
      );
      if (!signal.aborted && mounted.current) {
        setResult(null);
        setLink("");
        setShareConsent(false);
        setFile(null);
        URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = "";
        setPreview("");
        setNotice(
          "The stored original and processed portrait have been deleted.",
        );
      }
    });
  }
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Commonlight home">
          BC <span>+</span> AI
        </Link>
        <span className="header-label">MEMBER PORTRAIT STUDIO</span>
        <span className="pill">LOCAL PROTOTYPE</span>
      </header>
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">COMMONLIGHT / PEOPLE, AS THEY ARE</p>
            <h1>
              A shared look.
              <br />
              <em>Still entirely you.</em>
            </h1>
            <p className="intro">
              A little light. A consistent frame. A portrait that belongs in the
              room, without changing the person in it.
            </p>
            <a className="text-link" href="#studio">
              Make your portrait <span aria-hidden="true">↘</span>
            </a>
          </div>
          <div
            className="hero-art"
            aria-label="Abstract portrait framing illustration, not a real person"
          >
            <div className="art-grid" />
            <div className="bust" />
            <div className="frame-corner top" />
            <div className="frame-corner bottom" />
            <span className="art-caption">YOUR FACE. YOUR CHOICE.</span>
            <span className="art-spec">4:5 / 720px</span>
          </div>
        </section>
        <div className="principles">
          <span>01 / Real identity</span>
          <span>02 / Private by default</span>
          <span>03 / Share by choice</span>
        </div>
        <section id="studio" className="studio">
          <div className="section-title">
            <p className="eyebrow">THE STUDIO</p>
            <h2 ref={heading} tabIndex={-1}>
              {result ? "Meet your portrait." : "Start with a good moment."}
            </h2>
            <p>
              {result
                ? "Compare the original with the prepared portrait. If the crop or colour feels wrong, keep your original and try another photo."
                : "Face a window. Keep the camera at eye level. Leave a little room around your head and shoulders."}
            </p>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <p className="status" role="status" aria-live="polite">
            {busy ? "Working on your request…" : notice}
          </p>
          {!result ? (
            <div className="workspace">
              <div className="photo-panel">
                <video
                  ref={video}
                  autoPlay
                  playsInline
                  muted
                  hidden={!camera}
                  aria-label="Live camera preview"
                />
                {!camera &&
                  (preview ? (
                    <img src={preview} alt="Selected source photograph" />
                  ) : (
                    <div className="empty-photo">
                      <span className="cross">+</span>
                      <h3>Your portrait begins here</h3>
                      <p>
                        Upload a photo or use your camera.
                        <br />
                        Nothing is shared automatically.
                      </p>
                    </div>
                  ))}
                <div className="panel-footer">
                  <span>
                    {camera
                      ? "CAMERA ON · LIVE PREVIEW"
                      : preview
                        ? "SOURCE PHOTO · NOT YET UPLOADED"
                        : "JPEG / PNG / WEBP"}
                  </span>
                  <span>UP TO 10 MB</span>
                </div>
              </div>
              <div className="controls">
                <p className="step-label">01 / PERMISSION</p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={busy}
                    onChange={(e) => {
                      setConsent(e.target.checked);
                      if (!e.target.checked) stopCamera();
                    }}
                  />
                  <span>
                    I’m the person in this photo, or have their permission to
                    capture and process it here.
                  </span>
                </label>
                <p className="small">
                  Camera access starts only when you choose it. Processing
                  happens on this local server. No photos are sent to an AI
                  provider.
                </p>
                <div className="button-row">
                  <label
                    className={`button secondary ${busy ? "disabled" : ""}`}
                  >
                    Upload photo
                    <input
                      aria-label="Upload photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        choose(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    className="secondary"
                    disabled={!consent || busy || cameraPending || camera}
                    onClick={openCamera}
                  >
                    {cameraPending ? "Waiting for camera…" : "Use camera"}
                  </button>
                </div>
                {(camera || cameraPending) && (
                  <div className="button-row">
                    {camera && <button onClick={capture}>Take photo</button>}
                    <button className="secondary" onClick={stopCamera}>
                      Close camera
                    </button>
                  </div>
                )}
                <hr />
                <p className="step-label">02 / FINISHING TOUCHES</p>
                <label className="field">
                  Name on portrait <span>(optional)</span>
                  <input
                    type="text"
                    maxLength={60}
                    value={name}
                    disabled={busy}
                    placeholder="Your name"
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={mark}
                    disabled={busy}
                    onChange={(e) => setMark(e.target.checked)}
                  />
                  <span>Add a BC + AI text mark</span>
                </label>
                <button
                  className="primary wide"
                  disabled={!file || !consent || busy}
                  onClick={prepare}
                >
                  Prepare my portrait <span aria-hidden="true">↗</span>
                </button>
                {busy && (
                  <button className="secondary wide" onClick={cancel}>
                    Cancel request
                  </button>
                )}
                <p className="small">
                  Gentle global brightness and colour adjustment. Center crop,
                  576 × 720, 8-bit JPEG. No face reshaping, age changes or
                  generated features.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="comparison">
                <figure>
                  <img
                    src={`/api/portraits/${result.id}?kind=preview`}
                    alt="Metadata-stripped full-frame preview of the original"
                  />
                  <figcaption>ORIGINAL PREVIEW / FULL FRAME</figcaption>
                </figure>
                <figure>
                  <img
                    src={`/api/portraits/${result.id}?kind=processed`}
                    alt="Prepared portrait with consistent crop and gentle colour adjustment"
                  />
                  <figcaption>PREPARED / 576 × 720</figcaption>
                </figure>
              </div>
              <div className="review-actions">
                <a
                  className="button primary"
                  href={`/api/portraits/${result.id}?kind=processed`}
                  download="commonlight-portrait.jpg"
                >
                  Download portrait ↓
                </a>
                <a
                  className="button secondary"
                  href={`/api/portraits/${result.id}?kind=original`}
                  download
                >
                  Save exact original
                </a>
                <button className="danger" onClick={remove} disabled={busy}>
                  Delete both & start again
                </button>
              </div>
              <div className="share-panel">
                <div>
                  <p className="step-label">03 / YOUR CALL</p>
                  <h3>{link ? "Shared by link." : "Good to share?"}</h3>
                  <p>
                    Only the prepared image will be visible. The original stays
                    private.
                  </p>
                  <p className="small">
                    Expires {new Date(result.expiresAt).toLocaleString()}.
                    Server restart also removes it. Anyone holding a shared link
                    can save a copy.
                  </p>
                </div>
                <div>
                  {!link ? (
                    <>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={shareConsent}
                          disabled={busy}
                          onChange={(e) => setShareConsent(e.target.checked)}
                        />
                        <span>
                          The person pictured explicitly agrees to this portrait
                          being visible to anyone with its gallery link.
                        </span>
                      </label>
                      <button
                        disabled={!shareConsent || busy}
                        onClick={publish}
                      >
                        Create gallery link ↗
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="field">
                        Gallery link
                        <input
                          readOnly
                          value={link}
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                      <div className="button-row">
                        <a
                          className="button primary"
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open portrait ↗
                        </a>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={revoke}
                        >
                          Revoke link
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
        <section className="honesty">
          <p className="eyebrow">A SMALL, HONEST PROTOTYPE</p>
          <div>
            <h2>
              Better consistency.
              <br />
              No invented you.
            </h2>
            <p>
              This version uses a deterministic photo pipeline. It can gently
              adjust the whole image; it can’t recreate lost detail, repair
              difficult lighting or decide what looks like you.
            </p>
            <p>
              Exact uploaded originals (including their metadata) are retained
              privately with a metadata-stripped preview and prepared image
              until the private session expires, at most 24 hours. A restart
              clears everything. Keep downloaded copies you want to retain.
              Reloading this page loses the current review controls.
            </p>
            <p>
              Hosted processing and permanent storage are future integrations,
              currently unavailable. This studio is local-only; gallery links
              work only while this server is running and reachable on your own
              device.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <a
          className="brand"
          href="https://bc-ai.ca/"
          target="_blank"
          rel="noreferrer"
        >
          BC <span>+</span> AI
        </a>
        <span>Commonlight · working title · private prototype</span>
        <span>Made for the people in the room.</span>
      </footer>
    </>
  );
}
