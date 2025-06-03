let allCourses = [];
let currentView = 'list';
let currentCalendarDate = new Date();

// Funzione migliorata per normalizzare qualsiasi URL Google Sheets
function normalizeGoogleSheetsUrl(url) {
    console.log('URL originale:', url);
    
    // Estrai l'ID del foglio da qualsiasi formato di URL
    const patterns = [
        /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,  // Pattern standard
        /\/document\/d\/([a-zA-Z0-9-_]+)/,      // Pattern alternativo
        /id=([a-zA-Z0-9-_]+)/,                  // Pattern con parametro id
    ];
    
    let fileId = null;
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            fileId = match[1];
            break;
        }
    }
    
    if (!fileId) {
        throw new Error('Non riesco a estrarre l\'ID del foglio dall\'URL fornito');
    }
    
    console.log('ID estratto:', fileId);
    
    // Estrai il GID se presente (per fogli specifici)
    let gid = '0'; // Default al primo foglio
    const gidMatch = url.match(/[#&]gid=([0-9]+)/);
    if (gidMatch) {
        gid = gidMatch[1];
    }
    
    console.log('GID estratto:', gid);
    
    return {
        fileId: fileId,
        gid: gid,
        jsonUrl: `https://docs.google.com/spreadsheets/d/${fileId}/gviz/tq?tqx=out:json&gid=${gid}`,
        csvUrl: `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=${gid}`
    };
}

// Funzione per caricare i dati dal Google Sheet
async function loadSheet() {
    const sheetUrl = document.getElementById('sheetUrl').value.trim();
    if (!sheetUrl) {
        alert('Inserisci il link del Google Sheet');
        return;
    }

    document.getElementById('listView').innerHTML = '<div class="loading">Caricamento dati...</div>';
    
    try {
        const urls = normalizeGoogleSheetsUrl(sheetUrl);
        console.log('URLs generati:', urls);
        
        // TENTATIVO 1: JSON format (più affidabile)
        console.log('Tentativo 1 - JSON URL:', urls.jsonUrl);
        
        try {
            const jsonResponse = await fetch(urls.jsonUrl, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            });
            
            if (jsonResponse.ok) {
                const jsonText = await jsonResponse.text();
                console.log('JSON ricevuto (primi 200 caratteri):', jsonText.substring(0, 200));
                
                // Il JSON di Google ha un prefisso da rimuovere
                const cleanJson = jsonText.replace(/^.*?({.*}).*$/, '$1');
                const data = JSON.parse(cleanJson);
                
                const courses = parseJsonData(data);
                if (courses.length > 0) {
                    console.log('Successo con formato JSON!');
                    allCourses = courses;
                    document.getElementById('setupInstructions').style.display = 'none';
                    populateFilters();
                    renderCourses();
                    renderCalendar();
                    return;
                } else {
                    console.log('JSON valido ma nessun corso trovato, provo CSV...');
                }
            }
        } catch (jsonError) {
            console.log('Formato JSON fallito:', jsonError.message);
        }
        
        // TENTATIVO 2: CSV format (fallback)
        console.log('Tentativo 2 - CSV URL:', urls.csvUrl);
        
        const csvResponse = await fetch(urls.csvUrl, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
            headers: {
                'Accept': 'text/csv,text/plain,*/*'
            }
        });
        
        console.log('CSV Response status:', csvResponse.status);
        
        if (!csvResponse.ok) {
            throw new Error(`Errore HTTP: ${csvResponse.status} - ${csvResponse.statusText}`);
        }
        
        const csvText = await csvResponse.text();
        console.log('CSV ricevuto (primi 200 caratteri):', csvText.substring(0, 200));
        
        if (!csvText || csvText.trim().length === 0) {
            throw new Error('Il foglio sembra essere vuoto');
        }
        
        const courses = parseCsvData(csvText);
        console.log('Corsi parsati:', courses);
        
        if (courses.length === 0) {
            throw new Error('Nessun corso valido trovato nel foglio. Controlla il formato dei dati.');
        }
        
        allCourses = courses;
        document.getElementById('setupInstructions').style.display = 'none';
        populateFilters();
        renderCourses();
        renderCalendar();
        
        console.log('Caricamento CSV completato con successo!');
        
    } catch (error) {
        console.error('Errore nel caricamento:', error);
        document.getElementById('listView').innerHTML = 
            `<div class="error">
                <h3>❌ Errore nel caricamento</h3>
                <p><strong>Dettaglio:</strong> ${error.message}</p>
                <p><strong>Possibili soluzioni:</strong></p>
                <ul style="text-align: left; margin: 10px 0;">
                    <li>🔓 Verifica che il Google Sheet sia completamente pubblico ("Chiunque abbia il link può visualizzare")</li>
                    <li>🌐 Prova con un browser diverso o in modalità incognito</li>
                    <li>🔄 Ricarica la pagina e riprova</li>
                    <li>📋 Assicurati che il foglio contenga le colonne: data inizio, data fine, corso, note, istruttori</li>
                    <li>🛠️ Apri la console (F12) per dettagli tecnici</li>
                </ul>
            </div>`;
    }
}

// Funzione per parsare i dati JSON da Google Sheets
function parseJsonData(data) {
    const courses = [];
    
    try {
        if (!data.table || !data.table.rows) {
            console.error('Struttura JSON non valida:', data);
            return courses;
        }
        
        console.log('Righe disponibili:', data.table.rows.length);
        
        for (let i = 0; i < data.table.rows.length; i++) {
            const row = data.table.rows[i];
            
            if (!row.c || row.c.length < 3) {
                console.log(`Riga ${i + 1} saltata: dati insufficienti`);
                continue;
            }
            
            // Estrai i valori dalle celle
            const startDate = row.c[0] ? (row.c[0].v || row.c[0].f || '') : '';
            const endDate = row.c[1] ? (row.c[1].v || row.c[1].f || '') : '';
            const course = row.c[2] ? (row.c[2].v || row.c[2].f || '') : '';
            const notes = row.c[3] ? (row.c[3].v || row.c[3].f || '') : '';
            
            // Estrai istruttori (colonne 4-7)
            const instructors = [];
            for (let j = 4; j < 8; j++) {
                if (row.c[j] && row.c[j].v) {
                    const instructor = row.c[j].v.toString().trim();
                    if (instructor) {
                        instructors.push(instructor);
                    }
                }
            }
            
            // Salta le righe senza dati essenziali
            if (!course || course.toString().trim() === '' || instructors.length === 0) {
                console.log(`Riga ${i + 1} saltata: corso o istruttori mancanti`);
                continue;
            }
            
            // Determina la data da usare (priorità: data inizio, poi data fine)
            let dateToUse = startDate || endDate;
            
            if (!dateToUse) {
                console.log(`Riga ${i + 1} saltata: nessuna data disponibile`);
                continue;
            }
            
            // Converti la data
            let parsedDate;
            if (typeof dateToUse === 'number') {
                // Google Sheets salva le date come numeri (giorni da 1/1/1900)
                parsedDate = new Date((dateToUse - 25569) * 86400 * 1000);
            } else if (typeof dateToUse === 'string') {
                parsedDate = new Date(dateToUse);
            } else {
                console.log(`Riga ${i + 1} saltata: formato data non riconosciuto:`, dateToUse);
                continue;
            }
            
            if (isNaN(parsedDate.getTime())) {
                console.log(`Riga ${i + 1} saltata: data non valida:`, dateToUse);
                continue;
            }
            
            courses.push({
                startDate: parsedDate,
                endDate: endDate ? (typeof endDate === 'number' ? new Date((endDate - 25569) * 86400 * 1000) : new Date(endDate)) : parsedDate,
                course: course.toString().trim(),
                notes: notes.toString().trim(),
                instructors: instructors
            });
            
            console.log(`Corso aggiunto: ${course}, istruttori: ${instructors.join(', ')}`);
        }
        
    } catch (error) {
        console.error('Errore nel parsing JSON:', error);
    }
    
    return courses;
}

// Funzione per parsare i dati CSV
function parseCsvData(csvText) {
    const courses = [];
    const lines = csvText.split('\n');
    
    console.log('Linee CSV totali:', lines.length);
    
    // Salta la prima riga (intestazioni) e processa le righe dati
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parsing CSV più robusto che gestisce virgole all'interno delle virgolette
        const fields = parseCSVLine(line);
        
        console.log(`Riga ${i + 1} - Campi trovati:`, fields.length, fields);
        
        if (fields.length < 5) {
            console.log(`Riga ${i + 1} saltata: campi insufficienti (${fields.length})`);
            continue;
        }
        
        const startDate = fields[0] ? fields[0].trim() : '';
        const endDate = fields[1] ? fields[1].trim() : '';
        const course = fields[2] ? fields[2].trim() : '';
        const notes = fields[3] ? fields[3].trim() : '';
        
        // Estrai istruttori (colonne 4-7)
        const instructors = [];
        for (let j = 4; j < Math.min(8, fields.length); j++) {
            if (fields[j] && fields[j].trim()) {
                instructors.push(fields[j].trim());
            }
        }
        
        // Salta le righe senza dati essenziali
        if (!course || instructors.length === 0) {
            console.log(`Riga ${i + 1} saltata: corso o istruttori mancanti`);
            continue;
        }
        
        // Determina la data da usare (priorità: data inizio, poi data fine)
        const dateToUse = startDate || endDate;
        
        if (!dateToUse) {
            console.log(`Riga ${i + 1} saltata: nessuna data disponibile`);
            continue;
        }
        
        // Converti la data
        const parsedStartDate = new Date(dateToUse);
        const parsedEndDate = endDate ? new Date(endDate) : parsedStartDate;
        
        if (isNaN(parsedStartDate.getTime())) {
            console.log(`Riga ${i + 1} saltata: data non valida:`, dateToUse);
            continue;
        }
        
        courses.push({
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            course: course,
            notes: notes,
            instructors: instructors
        });
        
        console.log(`Corso aggiunto: ${course}, istruttori: ${instructors.join(', ')}`);
    }
    
    return courses;
}

// Funzione helper per parsare una riga CSV gestendo le virgolette
function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    fields.push(current);
    return fields;
}

// Funzione per caricare file locali
async function loadLocalFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Seleziona un file da caricare');
        return;
    }

    document.getElementById('listView').innerHTML = '<div class="loading">Caricamento file...</div>';
    
    try {
        let courses = [];
        
        if (file.name.toLowerCase().endsWith('.csv')) {
            courses = await loadCSVFile(file);
        } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            courses = await loadExcelFile(file);
        } else {
            throw new Error('Formato file non supportato. Usa CSV o Excel.');
        }
        
        if (courses.length === 0) {
            throw new Error('Nessun corso valido trovato nel file.');
        }
        
        allCourses = courses;
        document.getElementById('setupInstructions').style.display = 'none';
        populateFilters();
        renderCourses();
        renderCalendar();
        
        console.log('File caricato con successo!');
        
    } catch (error) {
        console.error('Errore nel caricamento del file:', error);
        document.getElementById('listView').innerHTML = 
            `<div class="error">
                <h3>❌ Errore nel caricamento del file</h3>
                <p><strong>Dettaglio:</strong> ${error.message}</p>
                <p><strong>Formato atteso:</strong> Le colonne dovrebbero essere: Data Inizio, Data Fine, Corso, Note, Istruttore1, Istruttore2, etc.</p>
            </div>`;
    }
}

// Funzione per caricare file CSV
function loadCSVFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const csvText = e.target.result;
                const courses = parseCsvData(csvText);
                resolve(courses);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = function() {
            reject(new Error('Errore nella lettura del file CSV'));
        };
        reader.readAsText(file);
    });
}

// Funzione per caricare file Excel
function loadExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                
                // Prendi il primo foglio
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Converti in CSV
                const csvText = XLSX.utils.sheet_to_csv(worksheet);
                const courses = parseCsvData(csvText);
                resolve(courses);
            } catch (error) {
                reject(new Error('Errore nella lettura del file Excel: ' + error.message));
            }
        };
        reader.onerror = function() {
            reject(new Error('Errore nella lettura del file Excel'));
        };
        reader.readAsArrayBuffer(file);
    });
}

// Funzione per popolare i filtri
function populateFilters() {
    const instructorSelect = document.getElementById('filterInstructor');
    const courseSelect = document.getElementById('filterCourse');
    
    // Reset filtri
    instructorSelect.innerHTML = '<option value="">Tutti gli istruttori</option>';
    courseSelect.innerHTML = '<option value="">Tutti i corsi</option>';
    
    // Estrai tutti gli istruttori unici
    const allInstructors = new Set();
    const allCourseTypes = new Set();
    
    allCourses.forEach(course => {
        course.instructors.forEach(instructor => {
            allInstructors.add(instructor);
        });
        allCourseTypes.add(course.course);
    });
    
    // Popola filtro istruttori
    Array.from(allInstructors).sort().forEach(instructor => {
        const option = document.createElement('option');
        option.value = instructor;
        option.textContent = instructor;
        instructorSelect.appendChild(option);
    });
    
    // Popola filtro corsi
    Array.from(allCourseTypes).sort().forEach(courseType => {
        const option = document.createElement('option');
        option.value = courseType;
        option.textContent = courseType;
        courseSelect.appendChild(option);
    });
}

// Funzione per filtrare e renderizzare i corsi
function renderCourses() {
    const instructorFilter = document.getElementById('filterInstructor').value;
    const courseFilter = document.getElementById('filterCourse').value;
    const monthFilter = document.getElementById('filterMonth').value;
    
    let filteredCourses = allCourses.filter(course => {
        // Filtro istruttore
        if (instructorFilter && !course.instructors.some(instructor => 
            instructor.toLowerCase().includes(instructorFilter.toLowerCase()))) {
            return false;
        }
        
        // Filtro corso
        if (courseFilter && !course.course.toLowerCase().includes(courseFilter.toLowerCase())) {
            return false;
        }
        
        // Filtro mese
        if (monthFilter !== '' && course.startDate.getMonth() !== parseInt(monthFilter)) {
            return false;
        }
        
        return true;
    });
    
    // Ordina per data
    filteredCourses.sort((a, b) => a.startDate - b.startDate);
    
    const listView = document.getElementById('listView');
    
    if (filteredCourses.length === 0) {
        listView.innerHTML = '<div class="no-courses">Nessun corso trovato con i filtri selezionati.</div>';
        return;
    }
    
    const coursesHtml = filteredCourses.map(course => {
        const dateRange = course.startDate.getTime() === course.endDate.getTime() ? 
            formatDate(course.startDate) : 
            `${formatDate(course.startDate)} - ${formatDate(course.endDate)}`;
        
        const instructorsHtml = course.instructors.map(instructor => 
            `<span class="instructor-tag">${instructor}</span>`
        ).join('');
        
        const notesHtml = course.notes ? 
            `<div class="course-notes">📝 ${course.notes}</div>` : '';
        
        return `
            <div class="course-card">
                <div class="course-header">
                    <h3 class="course-title">${course.course}</h3>
                    <div class="course-date">${dateRange}</div>
                </div>
                <div class="instructors">
                    <div class="instructors-title">👨‍🏫 Istruttori:</div>
                    <div class="instructor-list">${instructorsHtml}</div>
                </div>
                ${notesHtml}
            </div>
        `;
    }).join('');
    
    listView.innerHTML = coursesHtml;
}

// Funzione per formattare la data
function formatDate(date) {
    return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Funzione per cambiare vista
function switchView(view) {
    currentView = view;
    
    // Aggiorna bottoni
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[onclick="switchView('${view}')"]`).classList.add('active');
    
    // Mostra/nascondi viste
    if (view === 'list') {
        document.getElementById('listView').style.display = 'block';
        document.getElementById('calendarView').style.display = 'none';
    } else {
        document.getElementById('listView').style.display = 'none';
        document.getElementById('calendarView').style.display = 'block';
        renderCalendar();
    }
}

// Funzione per renderizzare il calendario
function renderCalendar() {
    const monthNames = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];
    
    const currentMonth = currentCalendarDate.getMonth();
    const currentYear = currentCalendarDate.getFullYear();
    
    document.getElementById('currentMonth').textContent = `${monthNames[currentMonth]} ${currentYear}`;
    
    // Calcola primo giorno del mese e numero di giorni
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // Lunedì = 0
    
    const calendarGrid = document.getElementById('calendarGrid');
    calendarGrid.innerHTML = '';
    
    // Giorni del mese precedente
    const prevMonth = new Date(currentYear, currentMonth - 1, 0);
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<div class="day-number">${prevMonth.getDate() - i}</div>`;
        calendarGrid.appendChild(dayDiv);
    }
    
    // Giorni del mese corrente
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        
        const currentDate = new Date(currentYear, currentMonth, day);
        
        // Evidenzia oggi
        if (currentDate.toDateString() === today.toDateString()) {
            dayDiv.classList.add('today');
        }
        
        dayDiv.innerHTML = `<div class="day-number">${day}</div>`;
        
        // Trova corsi per questo giorno
        const coursesForDay = allCourses.filter(course => {
            const courseStart = new Date(course.startDate.getFullYear(), course.startDate.getMonth(), course.startDate.getDate());
            const courseEnd = new Date(course.endDate.getFullYear(), course.endDate.getMonth(), course.endDate.getDate());
            return currentDate >= courseStart && currentDate <= courseEnd;
        });
        
        // Aggiungi eventi
        coursesForDay.forEach(course => {
            const eventDiv = document.createElement('div');
            eventDiv.className = 'calendar-event';
            eventDiv.textContent = course.course;
            eventDiv.title = `${course.course} - ${course.instructors.join(', ')}`;
            dayDiv.appendChild(eventDiv);
        });
        
        calendarGrid.appendChild(dayDiv);
    }
    
    // Giorni del mese successivo
    const totalCells = calendarGrid.children.length;
    const remainingCells = 42 - totalCells; // 6 righe x 7 giorni
    for (let day = 1; day <= remainingCells; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<div class="day-number">${day}</div>`;
        calendarGrid.appendChild(dayDiv);
    }
}

// Funzione per cambiare mese nel calendario
function changeMonth(direction) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction);
    renderCalendar();
}

// Event listeners per i filtri
document.getElementById('filterInstructor').addEventListener('change', renderCourses);
document.getElementById('filterCourse').addEventListener('change', renderCourses);
document.getElementById('filterMonth').addEventListener('change', renderCourses);

// Event listener per Enter nell'input URL
document.getElementById('sheetUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        loadSheet();
    }
});

console.log('App inizializzata. Pronta per caricare i dati.');

// Caricamento automatico del Google Sheet predefinito (commentato)
// const defaultSheetUrl = 'https://docs.google.com/spreadsheets/d/1CCvukFhXVdKXakVUZfUFRrc-4Tv-01AU/edit?usp=drivesdk&ouid=116613025297058558407&rtpof=true&sd=true';
// document.getElementById('sheetUrl').value = defaultSheetUrl;
// loadSheet();
// console.log('App inizializzata. Caricamento automatico in corso...');
