const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gSgbmyPjV2fDHBu0V5u13voWyGG9EnDHRQmjnDIcC_A/gviz/tq?tqx=out:json&gid=0';
const WA_NUMBER = '50489717182';

// DOM Elements
const inventoryGrid = document.getElementById('inventory-grid');
const loader = document.getElementById('inventory-loader');
const filterMake = document.getElementById('filter-make');
const filterModel = document.getElementById('filter-model');
const filterYearMin = document.getElementById('filter-year-min');
const filterPriceMax = document.getElementById('filter-price-max');
const btnApplyFilters = document.getElementById('btn-apply-filters');
const btnClearFilters = document.getElementById('btn-clear-filters');
const waButton = document.getElementById('wa-button');

// Lightbox Elements
const lightboxModal = document.getElementById('lightbox-modal');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxClose = document.querySelector('.lightbox-close');
const lightboxPrev = document.querySelector('.lightbox-prev');
const lightboxNext = document.querySelector('.lightbox-next');

let allVehicles = [];
let currentGalleryImages = [];
let currentGalleryIndex = 0;
let vendedor = '';

function normalizeImageUrl(url) {
    if (!url) return '';

    const trimmedUrl = url.trim();
    if (!trimmedUrl) return '';

    const driveMatch = trimmedUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (driveMatch) {
        return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1000`;
    }

    return trimmedUrl;
}

function getVehiclePrima(car) {
    const price = Number(car.price);
    const prima = Number(car.prima);

    if (Number.isFinite(prima) && prima >= 0) {
        return prima;
    }

    if (Number.isFinite(price) && price > 0) {
        return Math.round(price * 0.4);
    }

    return 0;
}

function parseSheetInventory(rawText) {
    const match = rawText.match(/setResponse\((.*)\)\s*;?\s*$/s);

    if (!match) {
        throw new Error('No se pudo extraer la respuesta del sheet');
    }

    const parsed = JSON.parse(match[1]);
    const rows = parsed?.table?.rows || [];

    return rows.map(row => {
        const cells = row.c || [];
        const getCell = (index, fallback = null) => {
            if (!cells[index]) return fallback;
            if (cells[index].v === undefined || cells[index].v === null) return fallback;
            return cells[index].v;
        };

        return {
            make: getCell(0, '') || '',
            model: getCell(1, '') || '',
            year: Number(getCell(2, 0)) || 0,
            price: Number(getCell(3, 0)) || 0,
            mileage: getCell(4, '') || '',
            motor: getCell(5, '') || '',
            status: getCell(6, '') || '',
            images: getCell(7, '') || '',
            dateAdded: getCell(8, '') || '',
            placa: getCell(9, '') || '',
            precioGanga: getCell(10, '') || '',
            comentarios: getCell(11, '') || '',
            prima: Number(getCell(12, NaN))
        };
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkVendedor();
    setupWhatsAppButton();
    loadInventory();
});

// Referrals
function checkVendedor() {
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has('vendedor')) {
        vendedor = urlParams.get('vendedor');
        // Keep it in session storage so it persists if they navigate
        sessionStorage.setItem('proautos_vendedor', vendedor);
    } else {
        vendedor = sessionStorage.getItem('proautos_vendedor') || '';
    }
}

function setupWhatsAppButton() {
    let message = "Hola Proautos, estoy interesado en comprar un vehículo.";
    if (vendedor) {
        message += ` (Atendido por vendedor: ${vendedor})`;
    }
    const encodedMessage = encodeURIComponent(message);
    waButton.href = `https://wa.me/${WA_NUMBER}?text=${encodedMessage}`;
}

function loadSheetDataViaScript() {
    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error('Tiempo de espera agotado al cargar el sheet'));
        }, 15000);

        const previousSetResponse = window.google?.visualization?.Query?.setResponse;

        const cleanup = () => {
            window.clearTimeout(timeoutId);
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }

            if (previousSetResponse) {
                window.google.visualization.Query.setResponse = previousSetResponse;
            } else {
                delete window.google?.visualization?.Query?.setResponse;
            }
        };

        const script = document.createElement('script');
        script.src = SHEET_URL;
        script.async = true;

        window.google = window.google || {};
        window.google.visualization = window.google.visualization || {};
        window.google.visualization.Query = window.google.visualization.Query || {};
        window.google.visualization.Query.setResponse = (response) => {
            cleanup();
            resolve(response);
        };

        script.onerror = () => {
            cleanup();
            reject(new Error('No se pudo cargar el script del sheet'));
        };

        document.head.appendChild(script);
    });
}

// Data Loading
async function loadInventory() {
    loader.style.display = 'flex';
    inventoryGrid.innerHTML = '';
    
    try {
        const response = await loadSheetDataViaScript();
        const rawText = `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify(response)});`;
        const data = parseSheetInventory(rawText);
        
        // Filter only cars that are not sold, or just show all but label them
        allVehicles = data.filter(car => car.status !== 'Vendido'); 
        
        loader.style.display = 'none';
        
        populateFilters();
        renderVehicles(allVehicles);

    } catch (error) {
        console.error('Error loading inventory:', error);
        loader.style.display = 'none';
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        inventoryGrid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color: #f87171;">Error al cargar el inventario. ${errorMessage}</p>`;
    }
}

function populateFilters() {
    const makes = new Set();
    const models = new Set();
    
    allVehicles.forEach(car => {
        if(car.make) makes.add(car.make);
        if(car.model) models.add(car.model);
    });
    
    makes.forEach(make => {
        const option = document.createElement('option');
        option.value = make;
        option.textContent = make;
        filterMake.appendChild(option);
    });
    
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        filterModel.appendChild(option);
    });
}

// Rendering
function renderVehicles(vehicles) {
    inventoryGrid.innerHTML = '';
    
    if (vehicles.length === 0) {
        inventoryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">No se encontraron vehículos con esos filtros.</p>';
        return;
    }

    vehicles.forEach((car, index) => {
        const imageUrls = car.images
            ? car.images.split(',').map(normalizeImageUrl).filter(Boolean)
            : [];
        const mainImage = imageUrls.length > 0 ? imageUrls[0] : 'bg.jpg';
        const price = Number(car.price);
        const primaMin = getVehiclePrima(car);
        
        const card = document.createElement('div');
        card.className = 'car-card';
        card.innerHTML = `
            <div class="car-image-container" onclick="openGallery('${encodeURIComponent(JSON.stringify(imageUrls))}', '${car.make} ${car.model}')">
                <img src="${mainImage}" alt="${car.make} ${car.model}" class="car-image">
                <div class="badge">${car.status}</div>
                ${imageUrls.length > 1 ? `<div style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.7); padding:4px 8px; border-radius:4px; font-size:12px;"><i class="fa-solid fa-images"></i> ${imageUrls.length}</div>` : ''}
            </div>
            <div class="car-details">
                <div class="car-price">Lps. ${price.toLocaleString()}</div>
                <h3 class="car-title">${car.make} ${car.model} ${car.year}</h3>
                <div class="car-specs">
                    <div class="spec-item"><i class="fa-solid fa-gauge-high"></i> ${car.mileage || 'N/D'} mi</div>
                    <div class="spec-item"><i class="fa-solid fa-gears"></i> ${car.motor || 'N/D'}</div>
                </div>
                <div class="prima-tag">
                    <i class="fa-solid fa-tag"></i> Prima desde: <strong>Lps. ${primaMin.toLocaleString()}</strong>
                </div>
                <div class="card-actions" style="grid-template-columns: 1fr; margin-top: 1rem;">
                    <button class="btn btn-secondary" onclick="openFinanceModal(${price}, ${primaMin}, '${car.make} ${car.model} ${car.year}')" style="width: 100%; margin-bottom: 0.5rem; justify-content: center;">
                        <i class="fa-solid fa-calculator"></i> Cotizar Financiamiento
                    </button>
                    <button class="btn btn-whatsapp" onclick="contactWaForCar('${car.make}', '${car.model}', '${car.year}')" style="width: 100%; justify-content: center; border:none;">
                        <i class="fa-brands fa-whatsapp"></i> Me Interesa
                    </button>
                </div>
            </div>
        `;
        inventoryGrid.appendChild(card);
    });
}

// Finance Modal Logic
let currentFinancePrice = 0;
let currentFinancePrimaMin = 0;
let currentFinanceCar = '';
let currentFinanceTerm = 48; // Default

// primaMin = the vehicle's own fixed prima amount from the sheet
window.openFinanceModal = function(price, primaMin, title) {
    currentFinancePrice = Number(price);
    currentFinancePrimaMin = Number(primaMin);
    currentFinanceCar = title;
    
    document.getElementById('finance-car-title').textContent = title;
    
    // Slider goes from the vehicle's fixed prima up to the full price
    const slider = document.getElementById('finance-slider');
    slider.min = currentFinancePrimaMin;
    slider.max = currentFinancePrice;
    slider.value = currentFinancePrimaMin; // Start at the minimum allowed prima
    // Step = 1000 lps for smooth granularity
    slider.step = 1000;
    
    document.getElementById('finance-min-prima').textContent =
        `Mín. requerida: Lps. ${currentFinancePrimaMin.toLocaleString()}`;
    document.getElementById('finance-max-prima').textContent =
        `Pago total: Lps. ${currentFinancePrice.toLocaleString()}`;
    
    selectTerm(48); // Reset term buttons and recalculate
    document.getElementById('finance-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

window.closeFinanceModal = function() {
    document.getElementById('finance-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

window.selectTerm = function(months) {
    currentFinanceTerm = months;
    
    // Update active button
    document.querySelectorAll('.term-btn').forEach(btn => {
        if(parseInt(btn.getAttribute('data-months')) === months) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    calculateFinance();
}

window.calculateFinance = function() {
    const slider = document.getElementById('finance-slider');
    const prima = Number(slider.value);
    const loanAmount = currentFinancePrice - prima;
    
    document.getElementById('finance-prima-display').textContent = `Lps. ${prima.toLocaleString()}`;
    document.getElementById('finance-loan-amount').textContent = `Lps. ${loanAmount.toLocaleString()}`;
    
    // Calculate Monthly Payment (18% annual)
    const monthlyPayment = calculateMonthlyPayment(loanAmount, 18, currentFinanceTerm);
    document.getElementById('finance-monthly-payment').textContent = `Lps. ${monthlyPayment.toLocaleString()}`;
}

window.submitFinanceLead = function() {
    const name = document.getElementById('lead-name').value;
    const phone = document.getElementById('lead-phone').value;
    
    if(!name || !phone) {
        alert("Por favor ingresa tu nombre y teléfono para enviar la cotización.");
        return;
    }
    
    const prima = document.getElementById('finance-slider').value;
    const loanAmount = currentFinancePrice - prima;
    
    let message = `Hola Proautos. Quiero cotizar financiamiento para el ${currentFinanceCar}.\n`;
    message += `Mi nombre: ${name}\n`;
    message += `Teléfono: ${phone}\n`;
    message += `Precio del Vehículo: Lps. ${currentFinancePrice.toLocaleString()}\n`;
    message += `Doy de Prima: Lps. ${Number(prima).toLocaleString()}\n`;
    message += `A Financiar: Lps. ${loanAmount.toLocaleString()} a ${currentFinanceTerm} meses.\n`;
    
    if (vendedor) {
        message += `\n(Lead capturado por vendedor: ${vendedor})`;
    }
    
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
    closeFinanceModal();
}

function calculateMonthlyPayment(principal, annualInterestRate, months) {
    if(principal <= 0) return 0;
    const monthlyRate = (annualInterestRate / 100) / 12;
    const payment = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
    return Math.round(payment);
}

// Contact specific car
window.contactWaForCar = function(make, model, year) {
    let message = `Hola Proautos, estoy muy interesado en el ${make} ${model} del año ${year} que vi en su página web.`;
    if (vendedor) {
        message += ` (Atendido por vendedor: ${vendedor})`;
    }
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
}

// Filtering Logic
btnApplyFilters.addEventListener('click', () => {
    const make = filterMake.value.toLowerCase();
    const model = filterModel.value.toLowerCase();
    const yearMin = parseInt(filterYearMin.value) || 0;
    const priceMax = parseInt(filterPriceMax.value) || Infinity;
    
    const filtered = allVehicles.filter(car => {
        const matchMake = make === '' || (car.make && car.make.toLowerCase().includes(make));
        const matchModel = model === '' || (car.model && car.model.toLowerCase().includes(model));
        const matchYear = (parseInt(car.year) || 0) >= yearMin;
        const matchPrice = (parseInt(car.price) || 0) <= priceMax;
        
        return matchMake && matchModel && matchYear && matchPrice;
    });
    
    renderVehicles(filtered);
    
    // Scroll to inventory
    document.getElementById('inventario').scrollIntoView({ behavior: 'smooth' });
});

btnClearFilters.addEventListener('click', () => {
    filterMake.value = '';
    filterModel.value = '';
    filterYearMin.value = '';
    filterPriceMax.value = '';
    renderVehicles(allVehicles);
});

// Lightbox Logic
window.openGallery = function(encodedUrls, title) {
    currentGalleryImages = JSON.parse(decodeURIComponent(encodedUrls));
    if(currentGalleryImages.length === 0) return;
    
    currentGalleryIndex = 0;
    lightboxCaption.textContent = title;
    updateLightboxImage();
    lightboxModal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent scrolling
}

function updateLightboxImage() {
    if(currentGalleryImages.length === 0) return;
    lightboxImg.src = currentGalleryImages[currentGalleryIndex];
}

function closeLightbox() {
    lightboxModal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

lightboxClose.onclick = closeLightbox;

lightboxPrev.onclick = () => {
    currentGalleryIndex = (currentGalleryIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
    updateLightboxImage();
};

lightboxNext.onclick = () => {
    currentGalleryIndex = (currentGalleryIndex + 1) % currentGalleryImages.length;
    updateLightboxImage();
};

window.onclick = (event) => {
    if (event.target == lightboxModal) {
        closeLightbox();
    }
};

document.addEventListener('keydown', (e) => {
    if(!lightboxModal.classList.contains('active')) return;
    if(e.key === 'Escape') closeLightbox();
    if(e.key === 'ArrowLeft') lightboxPrev.onclick();
    if(e.key === 'ArrowRight') lightboxNext.onclick();
});
