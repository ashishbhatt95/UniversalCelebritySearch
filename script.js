async function fetchCelebrityDetails(name) {
    try {
        const wikiApiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(name)}&prop=pageprops|extracts|pageimages&format=json&origin=*&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=300`;
        const wikiResp = await fetch(wikiApiUrl);
        const wikiData = await wikiResp.json();
        const pages = wikiData.query.pages;
        const page = Object.values(pages)[0];

        if (!page.extract) {
            return null;
        }

        const wikidataId = page.pageprops?.wikibase_item;
        let details = {
            name: page.title,
            extract: page.extract,
            thumbnail: page.thumbnail?.source || null
        };

        if (wikidataId) {
            const wikidataUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
            const wikidataResp = await fetch(wikidataUrl);
            const wikidataJson = await wikidataResp.json();
            const entity = wikidataJson.entities[wikidataId];

            function getClaimsValues(propertyId) {
                const claims = entity.claims[propertyId];
                if (!claims) return [];

                return claims.map(claim => {
                    const mainsnak = claim.mainsnak;
                    if (!mainsnak || !mainsnak.datavalue) return null;

                    const dv = mainsnak.datavalue;

                    if (dv.type === "wikibase-entityid") {
                        return dv.value.id;
                    }
                    if (dv.type === "string") {
                        return dv.value;
                    }
                    if (dv.type === "time") {
                        const date = dv.value.time.slice(1, 11);
                        return formatDate(date);
                    }

                    return null;
                }).filter(x => x !== null);
            }

            async function getLabelsForIds(ids) {
                if (!ids || ids.length === 0) return [];

                const idsStr = ids.join("|");
                const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${idsStr}&format=json&props=labels&languages=en&origin=*`;
                const resp = await fetch(url);
                const data = await resp.json();

                return ids.map(id => data.entities[id]?.labels?.en?.value || id);
            }

            const dob = getClaimsValues("P569");
            details.dateOfBirth = dob.length > 0 ? dob[0] : null;

            const dod = getClaimsValues("P570");
            details.dateOfDeath = dod.length > 0 ? dod[0] : null;

            const occupations = getClaimsValues("P106");
            details.occupations = occupations.length > 0 ? await getLabelsForIds(occupations) : [];

            const nationality = getClaimsValues("P27");
            details.nationality = nationality.length > 0 ? await getLabelsForIds(nationality) : [];

            const birthPlace = getClaimsValues("P19");
            details.birthPlace = birthPlace.length > 0 ? await getLabelsForIds(birthPlace) : [];

            const spouses = getClaimsValues("P26");
            details.spouses = spouses.length > 0 ? await getLabelsForIds(spouses) : [];

            const children = getClaimsValues("P40");
            details.children = children.length > 0 ? await getLabelsForIds(children) : [];

            const education = getClaimsValues("P69");
            details.education = education.length > 0 ? await getLabelsForIds(education) : [];

            const awards = getClaimsValues("P166");
            details.awards = awards.length > 0 ? await getLabelsForIds(awards) : [];

            const height = getClaimsValues("P2048");
            details.height = height.length > 0 ? height[0] + " cm" : null;

            const position = getClaimsValues("P39");
            details.position = position.length > 0 ? await getLabelsForIds(position) : [];
        }

        return details;
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function calculateAge(birthDate, deathDate = null) {
    const birth = new Date(birthDate);
    const end = deathDate ? new Date(deathDate) : new Date();
    const age = end.getFullYear() - birth.getFullYear();
    const monthDiff = end.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
        return age - 1;
    }
    return age;
}

async function searchCelebrity() {

    const input = document.getElementById("searchInput").value.trim();

    function toTitleCase(str) {
    return str
    .toLowerCase()
    .split(" ")
    .filter(word => word.length > 0)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(" ");
    }

    const name = toTitleCase(input);

    if (!name) {
        showAlert("Please enter a celebrity name", "warning");
        return;
    }

    document.getElementById("result").innerHTML = `
        <div class="text-center">
            <div class="loading-spinner"></div>
            <h4 style="color: #667eea; margin-top: 20px;">Searching for ${name}...</h4>
        </div>
    `;

    try {
        const details = await fetchCelebrityDetails(name);

        if (!details) {
            document.getElementById("result").innerHTML = `
                <div class="no-result">
                    <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 20px; color: #bdc3c7;"></i>
                    <h3>Person not found</h3>
                    <p>No information found for "${name}". Please check the spelling or try a different name.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="result-card">
                <div class="celebrity-header">
                    <h2><i class="fas fa-user-circle"></i> ${details.name}</h2>
                    ${details.thumbnail ? 
                        `<img src="${details.thumbnail}" class="celebrity-img" alt="${details.name}"/>` : 
                        `<div style="margin: 15px 0;"><i class="fas fa-user" style="font-size: 3rem; opacity: 0.3;"></i></div>`
                    }
                </div>
                
                <div class="overview-section">
                    <h3 class="section-title"><i class="fas fa-info-circle"></i> Overview</h3>
                    <p>${details.extract}</p>
                    <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(details.name)}" target="_blank" class="wiki-link">
                        <i class="fas fa-external-link-alt"></i> Read More
                    </a>
                </div>
                
                <div class="details-section">
                    <h3 class="section-title"><i class="fas fa-list"></i> Personal Information</h3>
                    <table class="info-table">`;

        if (details.dateOfBirth) {
            const age = details.dateOfDeath ? 
                `(age ${calculateAge(details.dateOfBirth, details.dateOfDeath)} at death)` : 
                `(age ${calculateAge(details.dateOfBirth)})`;
            
            html += `
                <tr>
                    <th><i class="fas fa-birthday-cake"></i> Born</th>
                    <td>${details.dateOfBirth} ${age}</td>
                </tr>`;
        }

        if (details.dateOfDeath) {
            html += `
                <tr>
                    <th><i class="fas fa-cross"></i> Died</th>
                    <td>${details.dateOfDeath}</td>
                </tr>`;
        }

        if (details.birthPlace.length) {
            html += `
                <tr>
                    <th><i class="fas fa-map-marker-alt"></i> Place of Birth</th>
                    <td>${details.birthPlace.join(", ")}</td>
                </tr>`;
        }

        if (details.nationality.length) {
            html += `
                <tr>
                    <th><i class="fas fa-flag"></i> Nationality</th>
                    <td>${details.nationality.join(", ")}</td>
                </tr>`;
        }

        if (details.occupations.length) {
            html += `
                <tr>
                    <th><i class="fas fa-briefcase"></i> Occupation</th>
                    <td>${details.occupations.join(", ")}</td>
                </tr>`;
        }

        if (details.position.length) {
            html += `
                <tr>
                    <th><i class="fas fa-crown"></i> Position</th>
                    <td>${details.position.join(", ")}</td>
                </tr>`;
        }

        if (details.height) {
            html += `
                <tr>
                    <th><i class="fas fa-ruler-vertical"></i> Height</th>
                    <td>${details.height}</td>
                </tr>`;
        }

        if (details.spouses.length) {
            html += `
                <tr>fetchCelebrityDetails
                    <th><i class="fas fa-heart"></i> Spouse</th>
                    <td>${details.spouses.join(", ")}</td>
                </tr>`;
        }

        if (details.children.length) {
            html += `
                <tr>
                    <th><i class="fas fa-child"></i> Children</th>
                    <td>${details.children.join(", ")}</td>
                </tr>`;
        }

        if (details.education.length) {
            html += `
                <tr>
                    <th><i class="fas fa-graduation-cap"></i> Education</th>
                    <td>${details.education.join(", ")}</td>
                </tr>`;
        }

        if (details.awards.length) {
            html += `
                <tr>
                    <th><i class="fas fa-trophy"></i> Awards</th>
                    <td>${details.awards.slice(0, 5).join(", ")}${details.awards.length > 5 ? '...' : ''}</td>
                </tr>`;
        }

        html += `</table></div></div>`;
        document.getElementById("result").innerHTML = html;

    } catch (err) {
        console.error('Search error:', err);
        document.getElementById("result").innerHTML = `
            <div class="error-result">
                <h3><i class="fas fa-exclamation-triangle"></i> Error</h3>
                <p>Unable to fetch data for "${name}". Please try again later.</p>
            </div>
        `;
    }
}

function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.getElementById('result').innerHTML = '';
    document.getElementById('result').appendChild(alertDiv);
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('result').innerHTML = '';
}

document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchCelebrity();
    }
});

document.getElementById('searchInput').focus();