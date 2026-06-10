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

// Build a lookup map: make -> sorted array of models
let makeModelsMap = {};

function populateFilters() {
    makeModelsMap = {};

    allVehicles.forEach(car => {
        const make = (car.make || '').trim();
        const model = (car.model || '').trim();
        if (!make) return;
        if (!makeModelsMap[make]) makeModelsMap[make] = new Set();
        if (model) makeModelsMap[make].add(model);
    });

    // Populate makes dropdown (sorted)
    const sortedMakes = Object.keys(makeModelsMap).sort();
    filterMake.innerHTML = '<option value="">Todas las marcas</option>';
    sortedMakes.forEach(make => {
        const option = document.createElement('option');
        option.value = make;
        option.textContent = make;
        filterMake.appendChild(option);
    });

    // Reset model dropdown
    updateModelDropdown('');
}

// Rebuild model dropdown based on selected make
function updateModelDropdown(selectedMake) {
    filterModel.innerHTML = '<option value="">Todos los modelos</option>';

    let models = [];
    if (selectedMake && makeModelsMap[selectedMake]) {
        models = [...makeModelsMap[selectedMake]].sort();
    } else {
        // No make selected: show all models (union)
        const allModels = new Set();
        Object.values(makeModelsMap).forEach(set => set.forEach(m => allModels.add(m)));
        models = [...allModels].sort();
    }

    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        filterModel.appendChild(option);
    });
}

// When make changes -> update models and re-apply filters live
filterMake.addEventListener('change', () => {
    filterModel.value = '';           // reset model selection
    updateModelDropdown(filterMake.value);
    applyFilters();
});

// Model, year, price -> apply live too
filterModel.addEventListener('change', applyFilters);
filterYearMin.addEventListener('input', applyFilters);
filterPriceMax.addEventListener('input', applyFilters);

function applyFilters() {
    const make  = filterMake.value.trim().toLowerCase();
    const model = filterModel.value.trim().toLowerCase();
    const yearMin  = parseInt(filterYearMin.value)  || 0;
    const priceMax = parseInt(filterPriceMax.value) || Infinity;

    const filtered = allVehicles.filter(car => {
        const carMake  = (car.make  || '').toLowerCase();
        const carModel = (car.model || '').toLowerCase();
        const carYear  = parseInt(car.year)  || 0;
        const carPrice = parseInt(car.price) || 0;

        const matchMake  = !make  || carMake  === make;
        const matchModel = !model || carModel === model;
        const matchYear  = carYear  >= yearMin;
        const matchPrice = carPrice <= priceMax;

        return matchMake && matchModel && matchYear && matchPrice;
    });

    renderVehicles(filtered);
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

// Apply button still scrolls to results
btnApplyFilters.addEventListener('click', () => {
    applyFilters();
    document.getElementById('inventario').scrollIntoView({ behavior: 'smooth' });
});

btnClearFilters.addEventListener('click', () => {
    filterMake.value  = '';
    filterModel.value = '';
    filterYearMin.value  = '';
    filterPriceMax.value = '';
    updateModelDropdown('');
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

/* =========================================
   Google Sign-In Popup
   ========================================= */
(function initGooglePopup() {
    const popup = document.getElementById('google-signin-popup');
    const closeBtn = document.getElementById('google-popup-close');

    // Don't show if user dismissed it this session
    if (sessionStorage.getItem('proautos_popup_dismissed')) return;

    // Show popup after 3 seconds
    const showTimer = setTimeout(() => {
        popup.classList.add('visible');
    }, 3000);

    closeBtn.addEventListener('click', () => {
        popup.classList.remove('visible');
        sessionStorage.setItem('proautos_popup_dismissed', '1');
        clearTimeout(showTimer);
    });
})();

// Google Sign-In callback
window.handleGoogleSignIn = function(response) {
    const popup = document.getElementById('google-signin-popup');

    // Decode JWT to get user info
    try {
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(window.atob(base64));

        // Update popup to show logged-in state
        popup.innerHTML = `
            <button class="google-popup-close" onclick="this.closest('.google-popup').classList.remove('visible')" aria-label="Cerrar">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <div class="google-popup-header">
                <div class="google-user-info">
                    <img src="${payload.picture}" alt="${payload.name}">
                    <div>
                        <div class="user-name">${payload.name}</div>
                        <div class="user-email">${payload.email}</div>
                    </div>
                </div>
                <h3 style="margin-top:1rem;">¡Sesión iniciada!</h3>
                <p>Ahora puedes guardar tus vehículos favoritos.</p>
            </div>
        `;
        sessionStorage.setItem('proautos_user', JSON.stringify({ name: payload.name, email: payload.email, picture: payload.picture }));

        // Auto-close after 4 seconds
        setTimeout(() => popup.classList.remove('visible'), 4000);
    } catch(e) {
        console.log('Google sign-in received.');
        popup.classList.remove('visible');
    }
};

/* =========================================
   Hero Search Bar
   ========================================= */
window.executeHeroSearch = function() {
    const query = document.getElementById('hero-search-input').value.trim().toLowerCase();
    if (!query) {
        document.getElementById('inventario').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    // Filter vehicles by query (matches make, model, year, motor)
    const results = allVehicles.filter(car => {
        const text = `${car.make} ${car.model} ${car.year} ${car.motor}`.toLowerCase();
        return text.includes(query);
    });

    renderVehicles(results);

    // Scroll to inventory
    document.getElementById('inventario').scrollIntoView({ behavior: 'smooth' });

    // Show search result context in section header
    const headerP = document.querySelector('.inventory-section .section-header p');
    if (headerP) {
        if (results.length > 0) {
            headerP.textContent = `${results.length} resultado(s) para "${document.getElementById('hero-search-input').value}"`;
            headerP.style.color = '#a3e635';
        } else {
            headerP.textContent = `No encontramos "${document.getElementById('hero-search-input').value}". Mostrando todo el inventario.`;
            headerP.style.color = '#f87171';
            setTimeout(() => renderVehicles(allVehicles), 2000);
        }
    }
};

// Allow Enter key to trigger search
document.getElementById('hero-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.executeHeroSearch();
});

/* =========================================
   Category Chip Filter
   ========================================= */
// Keywords map: category slug -> array of model keywords (lowercase)
const CATEGORY_KEYWORDS = {
    sedan: ['sentra', 'corolla', 'civic', 'altima', 'camry', 'elantra', 'aveo', 'spark', 'cobalt', 'cruze', 'jetta', 'passat', 'accord', 'fusion', 'malibu', 'impala', 'charger', 'mustang', 'sedan', 'yaris', 'vios', 'demio', 'mazda 3', 'mazda3'],
    suv: ['rav4', 'crv', 'cr-v', 'hrv', 'hr-v', 'pilot', 'passport', 'highlander', 'runner', '4runner', 'rogue', 'pathfinder', 'murano', 'qashqai', 'tucson', 'santa', 'sportage', 'sorento', 'outlander', 'eclipse', 'hilux', 'tacoma', 'tundra', 'f-150', 'f150', 'ranger', 'frontier', 'colorado', 'silverado', 'sierra', 'pickup', 'pick-up', 'suv', 'fortuner', 'land', 'cruiser', 'prado', 'surf', '4x4', 'pajero', 'montero', 'xtrail', 'x-trail'],
    van: ['odyssey', 'sienna', 'sedona', 'caravan', 'town', 'country', 'villager', 'quest', 'uplander', 'venture', 'van', 'minivan', 'hiace', 'h1', 'h-1', 'starex', 'urvan'],
    deportivo: ['mustang', 'camaro', 'challenger', 'corvette', 'miata', 'rx8', 'rx-8', 'supra', 'gtr', 'gt-r', 'sti', 'wrx', 'evo', 'evolution', 'sport', 'coupe', 'coupé', 'roadster'],
    camion: ['truck', 'camion', 'camión', 'box truck', 'canter', 'hino', 'isuzu', 'npr', 'nqr', 'ftr', 'fuso', 'kenworth', 'peterbilt', 'freightliner', 'international']
};

window.filterByCategory = function(category) {
    // Update chip active state
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-category') === category);
    });

    // Reset inventory header text
    const headerP = document.querySelector('.inventory-section .section-header p');
    if (headerP) {
        headerP.style.color = '';
    }

    if (category === 'todos') {
        renderVehicles(allVehicles);
        if (headerP) headerP.textContent = 'Vehículos disponibles, revisados y listos para ti.';
        document.getElementById('inventario').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    const keywords = CATEGORY_KEYWORDS[category] || [];

    const filtered = allVehicles.filter(car => {
        const text = `${car.make} ${car.model} ${car.year} ${car.motor}`.toLowerCase();
        return keywords.some(kw => text.includes(kw));
    });

    renderVehicles(filtered);

    const categoryLabels = {
        sedan: 'Sedán', suv: 'SUV / Pick-up', van: 'Van / Minivan',
        deportivo: 'Deportivos', camion: 'Camiones'
    };

    if (headerP) {
        if (filtered.length > 0) {
            headerP.textContent = `${filtered.length} vehículo(s) en categoría "${categoryLabels[category]}"`;
            headerP.style.color = '#a3e635';
        } else {
            headerP.textContent = `No tenemos "${categoryLabels[category]}" en este momento. Mostrando todo.`;
            headerP.style.color = '#f87171';
            setTimeout(() => {
                renderVehicles(allVehicles);
                headerP.textContent = 'Vehículos disponibles, revisados y listos para ti.';
                headerP.style.color = '';
            }, 2500);
        }
    }

    document.getElementById('inventario').scrollIntoView({ behavior: 'smooth' });
};
