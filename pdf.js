// Constants for PDF sizing (A4 Landscape: 297mm width, 210mm height)
const PDF_WIDTH = 297;
const PDF_HEIGHT = 210;
const MARGIN = 10;
const PAGE_HEIGHT = PDF_HEIGHT - 2 * MARGIN;

// Maximum number of patient columns (excluding time column) to display per printed page
const MAX_PATIENT_COLS_PER_PAGE = 4; // Max 5 total columns: 1 time + 4 patient
// The slot height defined in CSS is 40px
const SLOT_HEIGHT_PX = 40;

async function exportPlannerToPdf() {
    const { jsPDF } = window.jspdf;
    const PDF = new jsPDF("l", "mm", "a4"); // landscape
    const PDF_WIDTH = 297;
    const PDF_HEIGHT = 210;
    const MARGIN = 5;

    const planner = document.getElementById("planner");
    const header = document.getElementById("planner-header");
    const main = document.querySelector("main");
    const nonPrint = document.querySelectorAll(".no-print");

    // Hide UI buttons etc.
    nonPrint.forEach(el => (el.style.display = "none"));
    const originalMainClass = main.className;
    main.className = "px-4 sm:px-6 lg:px-8 py-6";

    // Maximum columns per page (1 time + 5 patients)
    const MAX_PATIENTS_PER_PAGE = 6;

    const gridHeader = header.querySelector(".grid");
    const totalCols = gridHeader ? gridHeader.children.length - 1 : 0; // exclude time column

    if (totalCols <= 0) {
        alert("No patients to print.");
        nonPrint.forEach(el => (el.style.display = ""));
        main.className = originalMainClass;
        return;
    }

    const pagesNeeded = Math.ceil(totalCols / (MAX_PATIENTS_PER_PAGE - 1));

    for (let page = 0; page < pagesNeeded; page++) {
        if (page > 0) PDF.addPage();

        const startIdx = page * (MAX_PATIENTS_PER_PAGE - 1);
        const endIdx = Math.min(startIdx + (MAX_PATIENTS_PER_PAGE - 1), totalCols);

        // --- Clone header and planner ---
        const headerClone = header.cloneNode(true);
        const plannerClone = planner.cloneNode(true);

        // --- Filter header cells ---
        const headerGrid = headerClone.querySelector(".grid");

        const headerCells = [...headerGrid.children];
        headerCells.forEach((cell, idx) => {
            if (idx === 0) return; // keep time
            const patientIndex = idx - 1;
            if (patientIndex < startIdx || patientIndex >= endIdx) {
                cell.remove();
            }
        });

        // --- Filter planner rows ---
        console.log({ plannerClone })
        const plannerGrid = plannerClone.querySelector(".grid");
        if (plannerGrid) {
            const rows = [...plannerGrid.children];
            for (const row of rows) {
                // Skip row if it has class "timer"
                if (row.classList.contains("timer")) continue;

                const cells = [...row.children];
                cells.forEach((cell, idx) => {
                    if (idx === 0) return; // keep time slot
                    const patientIndex = idx - 1;
                    if (patientIndex < startIdx || patientIndex >= endIdx - 1) {
                        cell.remove();
                    }
                });
            }
        }

        // --- Combine header + planner into container ---
        const captureContainer = document.createElement("div");
        captureContainer.style.background = "white";
        captureContainer.style.padding = "10px";
        captureContainer.append(headerClone);
        captureContainer.append(plannerClone);
        document.body.append(captureContainer);

        // Wait for layout paint
        await new Promise(r => setTimeout(r, 100));

        // --- Capture as canvas ---
        const canvas = await html2canvas(captureContainer, {
            scale: 2,
            scrollX: 0,
            scrollY: 0,
            useCORS: true,
            backgroundColor: "#ffffff",
            windowWidth: captureContainer.scrollWidth + 100, // ensures full left time slot
        });

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const imgWidth = PDF_WIDTH - 2 * MARGIN;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        PDF.addImage(imgData, "JPEG", MARGIN, MARGIN, imgWidth, imgHeight);

        captureContainer.remove(); // clean up
    }

    PDF.save(`Clinic_Schedule_${new Date().toISOString().slice(0, 10)}.pdf`);

    // Restore UI
    nonPrint.forEach(el => (el.style.display = ""));
    main.className = originalMainClass;
}

document.addEventListener("DOMContentLoaded", () => {
    const printBtn = document.getElementById("print-day");
    if (printBtn) printBtn.addEventListener("click", exportPlannerToPdf);
});