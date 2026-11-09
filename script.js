// ==========================================
// CACHELAB - CACHE MEMORY MAPPING SIMULATOR
// ==========================================

const $ = (id) => document.getElementById(id);

const cacheSizeInput = $("cacheSize");
const blockSizeInput = $("blockSize");
const mappingInput = $("mapping");
const waysInput = $("ways");
const addressesInput = $("addresses");

let simulationRunning = false;

// ==========================================
// SHOW ASSOCIATIVITY OPTIONS
// ==========================================

function updateMappingOptions() {
    $("waysField").style.display =
        mappingInput.value === "set" ? "flex" : "none";
}

mappingInput.addEventListener("change", updateMappingOptions);
updateMappingOptions();

// ==========================================
// LOAD SAMPLE ADDRESSES
// ==========================================

$("sampleBtn").addEventListener("click", () => {
    addressesInput.value = "0, 4, 8, 0, 12, 4";
    $("message").textContent = "Sample addresses loaded.";
    $("message").className = "message success";
});

// ==========================================
// RESET SIMULATOR
// ==========================================

$("resetBtn").addEventListener("click", () => {

    addressesInput.value = "";

    $("totalRequests").textContent = "0";
    $("hits").textContent = "0";
    $("misses").textContent = "0";
    $("hitRatio").textContent = "0%";
    $("missRatio").textContent = "0%";

    $("cacheBody").innerHTML = `
        <tr>
            <td colspan="5" class="empty-state">
                Run a simulation to view cache memory.
            </td>
        </tr>`;

    $("logBody").innerHTML = `
        <tr>
            <td colspan="9" class="empty-state">
                Execution details will appear here.
            </td>
        </tr>`;

    $("message").textContent = "";
    $("message").className = "message";

    simulationRunning = false;
});

// ==========================================
// START SIMULATION
// ==========================================

$("simulateBtn").addEventListener("click", runSimulation);

function runSimulation() {

    const cacheSize = Number(cacheSizeInput.value);
    const blockSize = Number(blockSizeInput.value);
    const mapping = mappingInput.value;
    const ways = Number(waysInput.value);

    const rawAddresses = addressesInput.value.trim();

    // ======================================
    // VALIDATE MEMORY ADDRESSES
    // ======================================

    if (!rawAddresses) {
        showError("Please enter memory addresses.");
        return;
    }

    const parts = rawAddresses.split(",");

    if (parts.some(part => part.trim() === "")) {
        showError("Please enter valid comma-separated addresses.");
        return;
    }

    const addresses = parts.map(part => Number(part.trim()));

    if (addresses.some(address =>
        !Number.isSafeInteger(address) || address < 0
    )) {
        showError("Addresses must be non-negative whole numbers.");
        return;
    }

    // ======================================
    // VALIDATE CACHE CONFIGURATION
    // ======================================

    if (
        !Number.isInteger(cacheSize) ||
        !Number.isInteger(blockSize) ||
        blockSize <= 0 ||
        cacheSize <= 0 ||
        cacheSize % blockSize !== 0
    ) {
        showError("Invalid cache or block size configuration.");
        return;
    }

    const lineCount = cacheSize / blockSize;

    if (
        mapping === "set" &&
        (!Number.isInteger(ways) ||
         ways <= 0 ||
         lineCount % ways !== 0)
    ) {
        showError("Associativity must divide the number of cache lines.");
        return;
    }

    // ======================================
    // CALCULATE CACHE ORGANIZATION
    // ======================================

    const setCount =
        mapping === "direct" ? lineCount :
        mapping === "set" ? lineCount / ways : 1;

    // ======================================
    // CALCULATE ADDRESS BIT LENGTHS
    // ======================================

    const offsetBits = Math.log2(blockSize);

    const indexBits =
        mapping === "direct"
            ? Math.log2(lineCount)
            : mapping === "set"
                ? Math.log2(setCount)
                : 0;

    const maxAddress = Math.max(...addresses);

    const addressBits = Math.max(
        8,
        Math.ceil(Math.log2(maxAddress + 1)),
        offsetBits + indexBits + 1
    );

    // ======================================
    // CREATE EMPTY CACHE LINES
    // ======================================

    const cache = Array.from({ length: lineCount }, (_, index) => ({
        line: index,
        valid: false,
        block: null,
        tag: null,
        loadedAt: null,
        lastStatus: ""
    }));

    let hits = 0;
    let misses = 0;
    let clock = 0;

    const logs = [];

    // ======================================
    // PROCESS MEMORY ADDRESSES
    // ======================================

    addresses.forEach((address, requestIndex) => {

        clock++;

        const blockNumber = Math.floor(address / blockSize);
        const offset = address % blockSize;

        let targetLines = [];
        let tag;
        let setIndex = null;
        let directIndex = null;

        // ==================================
        // DETERMINE MAPPING LOCATION
        // ==================================

        if (mapping === "direct") {

            directIndex = blockNumber % lineCount;

            tag = Math.floor(blockNumber / lineCount);

            targetLines = [cache[directIndex]];

        } else if (mapping === "associative") {

            tag = blockNumber;

            targetLines = cache;

        } else {

            setIndex = blockNumber % setCount;

            tag = Math.floor(blockNumber / setCount);

            targetLines = cache.filter(
                line => Math.floor(line.line / ways) === setIndex
            );
        }

        // ==================================
        // SEARCH FOR REQUESTED BLOCK
        // ==================================

        let selectedLine = targetLines.find(
            line => line.valid && line.block === blockNumber
        );

        let status;
        let evictedBlock = null;

        if (selectedLine) {

            // CACHE HIT
            hits++;

            status = "HIT";

            selectedLine.lastStatus = "HIT";

        } else {

            // CACHE MISS
            misses++;

            status = "MISS";

            // Select empty cache line first
            selectedLine = targetLines.find(line => !line.valid);

            // FIFO REPLACEMENT
            if (!selectedLine) {

                selectedLine = targetLines.reduce(
                    (oldest, current) =>
                        current.loadedAt < oldest.loadedAt
                            ? current : oldest
                );

                evictedBlock = selectedLine.block;
            }

            // Load requested memory block
            selectedLine.valid = true;
            selectedLine.block = blockNumber;
            selectedLine.tag = tag;
            selectedLine.loadedAt = clock;
            selectedLine.lastStatus = "MISS";
        }

        // ==================================
        // CONVERT ADDRESS TO BINARY
        // ==================================

        const binaryAddress = address
            .toString(2)
            .padStart(addressBits, "0");

        // ==================================
        // STORE EXECUTION DETAILS
        // ==================================

        logs.push({

            request: requestIndex + 1,

            address,

            binaryAddress,

            blockNumber,

            tag,

            indexValue:
                mapping === "direct"
                    ? directIndex
                    : mapping === "set"
                        ? setIndex
                        : "N/A",

            offset,

            setIndex,

            directIndex,

            selectedLine: selectedLine.line,

            status,

            evictedBlock

        });

    });

    // ======================================
    // CALCULATE SIMULATION STATISTICS
    // ======================================

    const total = addresses.length;

    const hitRatio = (hits / total) * 100;

    const missRatio = (misses / total) * 100;

    // ======================================
    // UPDATE STATISTICS CARDS
    // ======================================

    $("totalRequests").textContent = total;

    $("hits").textContent = hits;

    $("misses").textContent = misses;

    $("hitRatio").textContent =
        hitRatio.toFixed(2) + "%";

    $("missRatio").textContent =
        missRatio.toFixed(2) + "%";

    // ======================================
    // DISPLAY CACHE MEMORY
    // ======================================

    renderCache(cache);

    // ======================================
    // DISPLAY EXECUTION LOG
    // ======================================

    renderLogs(logs, mapping);

    // ======================================
    // DISPLAY SUCCESS MESSAGE
    // ======================================

    $("message").textContent =
        `Simulation completed! Hit ratio: ${hitRatio.toFixed(2)}% | Miss ratio: ${missRatio.toFixed(2)}%.`;

    $("message").className = "message success";

    simulationRunning = true;
}

// ==========================================
// DISPLAY CACHE CONTENTS
// ==========================================

function renderCache(cache) {

    $("cacheBody").innerHTML = cache.map(line => {

        const validBit = line.valid ? 1 : 0;

        const block = line.valid ? line.block : "—";

        const tag = line.valid ? line.tag : "—";

        const status = line.valid
            ? line.lastStatus
            : "EMPTY";

        const statusClass =
            status === "HIT" ? "hit" :
            status === "MISS" ? "miss" : "";

        return `
            <tr>
                <td>${line.line}</td>
                <td>${validBit}</td>
                <td>${block}</td>
                <td>${tag}</td>
                <td class="${statusClass}">${status}</td>
            </tr>
        `;

    }).join("");
}

// ==========================================
// DISPLAY STEP-BY-STEP EXECUTION LOG
// ==========================================

function renderLogs(logs, mapping) {

    $("logBody").innerHTML = logs.map(log => {

        let location;

        if (mapping === "direct") {

            location = `Line ${log.directIndex}`;

        } else if (mapping === "associative") {

            location = `Line ${log.selectedLine}`;

        } else {

            location = `Set ${log.setIndex}, Line ${log.selectedLine}`;

        }

        let result = log.status;

        if (log.evictedBlock !== null) {

            result += ` (Replaced block ${log.evictedBlock})`;

        }

        return `
            <tr>

                <td>${log.request}</td>

                <td>${log.address}</td>

                <td class="binary-address">
                    ${log.binaryAddress}
                </td>

                <td>${log.blockNumber}</td>

                <td>${log.tag}</td>

                <td>${log.indexValue}</td>

                <td>${log.offset}</td>

                <td>${location}</td>

                <td class="${log.status.toLowerCase()}">
                    ${result}
                </td>

            </tr>
        `;

    }).join("");
}

// ==========================================
// DISPLAY VALIDATION ERRORS
// ==========================================

function showError(message) {

    $("message").textContent = message;

    $("message").className = "message";

}