// dragDrop.js
import { gamePill, editorPill, settingsPill, setSaveName, new_update_notifications, setIsShowingNotification } from "./renderer.js";
import { saveHandleToRecents } from "./recentsManager.js";
import { Command } from "../backend/command.js";
import { isDesktopApp, readDesktopSaveFilePath, rememberDesktopFile } from "./desktopBridge.js";

let carAnalysisUtils = null;
export const dbWorker = new Worker(new URL('../backend/worker.js', import.meta.url));
let currentSaveSource = null;

const dropDiv = document.querySelector(".drop-div");
const statusCircle = document.getElementById("statusCircle");
const statusIcon = document.getElementById("statusIcon");
const statusTitle = document.getElementById("statusTitle");
const loadingSpinner = document.querySelector(".loading-spinner");
const statusDesc = document.getElementById("statusDesc");
const reloadSaveOverlay = document.getElementById("reloadSaveOverlay");
const reloadSaveOverlayText = document.getElementById("reloadSaveOverlayText");
const body = document.querySelector("body");

export const handleDragEnter = (event) => {
    event.preventDefault();
    body.classList.add("drag-active");
};

export const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
};

export const handleDragLeave = (event) => {
    event.preventDefault();
    body.classList.remove("drag-active");
};

export const handleDrop = async (event) => {
    event.preventDefault();
    body.classList.remove("drag-active");

    const item = event.dataTransfer.items[0];
    
    // ... el resto de tu lógica de drop ...
    if (item && item.kind === 'file') {
        try {
            const handle = await item.getAsFileSystemHandle();
            
            if (handle) {
                await saveHandleToRecents(handle);
                const file = await handle.getFile();
                await rememberDesktopFile(file);
                await processSaveFile(file, { fileHandle: handle });
            } else {
                const file = item.getAsFile();
                await rememberDesktopFile(file);
                await processSaveFile(file);
            }
        } catch (e) {
            console.error("Error with file handle:", e);
            const file = event.dataTransfer.files[0];
            await rememberDesktopFile(file);
            await processSaveFile(file);
        }
    }
};

dropDiv.addEventListener("dragenter", handleDragEnter);
dropDiv.addEventListener("dragover", handleDragOver);
dropDiv.addEventListener("dragleave", handleDragLeave);
dropDiv.addEventListener("drop", handleDrop);

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function sourceFromFile(file, options = {}) {
    const desktopPath = options.desktopPath || options.path || file?.desktopPath || file?.path || null;
    const fileHandle = options.fileHandle || options.handle || null;

    return {
        name: file?.name || options.name || "save.sav",
        desktopPath,
        fileHandle
    };
}

function canReloadCurrentSave() {
    return !!(
        currentSaveSource?.desktopPath ||
        currentSaveSource?.fileHandle
    );
}

function updateReloadButtonVisibility() {
    const reloadButton = document.getElementById("reloadSaveButton");
    if (!reloadButton) return;

    reloadButton.classList.toggle("hidden", !canReloadCurrentSave());
    reloadButton.setAttribute("aria-disabled", canReloadCurrentSave() ? "false" : "true");
}

function setReloadOverlay(visible, text) {
    if (!reloadSaveOverlay) return;

    if (reloadSaveOverlayText && text) {
        reloadSaveOverlayText.textContent = text;
    }

    reloadSaveOverlay.classList.toggle("hidden", !visible);
}

export async function reloadCurrentSave() {
    if (!canReloadCurrentSave()) {
        throw new Error("No reloadable save file is currently loaded.");
    }

    if (isDesktopApp() && currentSaveSource.desktopPath) {
        const file = await readDesktopSaveFilePath(currentSaveSource.desktopPath);
        if (!file) {
            throw new Error("Could not read the current save file from disk.");
        }
        await processSaveFile(file, { desktopPath: currentSaveSource.desktopPath, isReload: true });
        return;
    }

    if (currentSaveSource.fileHandle) {
        const file = await currentSaveSource.fileHandle.getFile();
        await processSaveFile(file, { fileHandle: currentSaveSource.fileHandle, isReload: true });
        return;
    }

    throw new Error("No reloadable save file is currently loaded.");
}

export async function processSaveFile(file, options = {}) {
    if (!file) return;

    // --- Validaciones de archivo ---
    if (file.name.split('.').pop() === "vdf") {
        console.error("File not supported");
        new_update_notifications(
            'File type not supported. See <a href="https://www.youtube.com/watch?v=w-USlPQxZm0" target="_blank">this video</a> to find your save file.',
            "error"
        );
        return;
    } else if (file.name.split('.').pop() === "sav") {
        
        const footerNotification = document.querySelector('.footer-notification');
        if (footerNotification && footerNotification.classList.contains('error')) {
            footerNotification.classList.remove('show');
            setIsShowingNotification(false);
        }
        
        const nextSaveSource = sourceFromFile(file, options);
        const isReload = options.isReload === true;
        setSaveName(file.name);

        // 1. Ponemos el icono en modo SPINNER
        if (isReload) {
            setReloadOverlay(true, `Reloading ${file.name}...`);
        } else {
            await updateStatusUI('loading');
        }

        // 2. Definimos la tarea de carga
        const dbLoadTask = new Promise((resolve, reject) => {
            dbWorker.postMessage({ command: 'loadDB', data: { file: file } });

            dbWorker.onmessage = (msg) => {
                if (msg.data.responseMessage === "Database loaded") {
                    console.log("[Main Thread] Database loaded in Worker");
                    const dateObj = new Date(msg.data.content);
                    const day = dateObj.getDate();
                    const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(dateObj);
                    const year = dateObj.getFullYear();
                    const completeDay = day + (day % 10 == 1 && day != 11 ? "st" : day % 10 == 2 && day != 12 ? "nd" : day % 10 == 3 && day != 13 ? "rd" : "th");
                    
                    document.querySelector("#dateDay").textContent = completeDay;
                    document.querySelector("#dateMonth").textContent = month;
                    document.querySelector("#dateYear").textContent = year;
                    document.querySelector("#dateDay2026").textContent = completeDay;
                    document.querySelector("#dateMonth2026").textContent = month;
                    document.querySelector("#dateYear2026").textContent = year;           

                    resolve(); 
                } else if (msg.data.error) {
                    console.error("[Main Thread] Error loading DB:", msg.data.error);
                    reject(new Error(msg.data.error));
                }
            };
        });

        // 3. Ejecutamos: Carga + Espera
        try {
            await Promise.all([
                dbLoadTask,
                wait(isReload ? 400 : 2000)
            ]);

            if (isReload) {
                setReloadOverlay(true, "Refreshing editor data...");
            } else {
                // 4. Ponemos el icono en modo CHECK VERDE
                await updateStatusUI('success', { filename: file.name });
            }

            // 5. Esperamos un momento extra
            await wait(isReload ? 250 : 1000);

            // 6. Finalmente mostramos el editor
            currentSaveSource = nextSaveSource;
            updateReloadButtonVisibility();
            editorPill.classList.remove("d-none");
            gamePill.classList.remove("d-none");
            settingsPill?.classList.remove("d-none");

            const command = new Command("saveSelected", {});
            command.execute();

            document.querySelector(".script-selector").classList.remove("hidden");
            document.querySelector(".footer").classList.remove("hidden");

        } catch (error) {
            console.error("Error en el proceso:", error);
            if (isReload) {
                throw error;
            }
        } finally {
            if (isReload) {
                setReloadOverlay(false);
            }
        }
    }
}


async function updateStatusUI(type, textConfig) {
    statusIcon.classList.add("icon-scale-0");
    
    await wait(170);

    if (type === 'loading') {
        loadingSpinner.classList.add("show");
        statusCircle.classList.remove("success-mode");
        
        statusTitle.textContent = "Analyzing database...";
        statusDesc.innerText = "This may take a few seconds.";
        
    } else if (type === 'success') {
        loadingSpinner.classList.remove("show");
        // Cambiar icono a Check y Colores
        statusIcon.className = "bi bi-check-lg"; // Volvemos a poner clase de icono
        statusIcon.classList.add("success-mode"); // Color verde al icono
        statusCircle.classList.add("success-mode"); // Fondo verde al circulo
        
        // Textos
        statusTitle.textContent = "Save loaded successfully!";
        statusDesc.innerText = textConfig.filename;

        await wait(50); 
        statusIcon.classList.remove("icon-scale-0");
    }
    
    
}
