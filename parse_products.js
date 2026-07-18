const fs = require('fs');
const path = require('path');

const imgDir = path.join(__dirname, 'media', 'img');
const outputFile = path.join(__dirname, 'products.json');

// Helper to recursively get files
function getFiles(dir, files_ = []) {
    const files = fs.readdirSync(dir);
    for (let i in files) {
        const name = path.join(dir, files[i]);
        if (fs.statSync(name).isDirectory()) {
            getFiles(name, files_);
        } else {
            // Only include image extensions
            const ext = path.extname(name).toLowerCase();
            if (['.jfif', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                files_.push(name);
            }
        }
    }
    return files_;
}

function parseProducts() {
    console.log("Scanning media/img directory...");
    if (!fs.existsSync(imgDir)) {
        console.error(`Error: Directory ${imgDir} does not exist.`);
        return;
    }

    const files = getFiles(imgDir);
    console.log(`Found ${files.length} images to parse.`);

    const products = [];
    let idCounter = 1;

    files.forEach(filePath => {
        // Relative path from project root (with forward slashes for URLs)
        const relPath = '/' + path.relative(__dirname, filePath).replace(/\\/g, '/');
        
        // Folder name directly under media/img is the category
        const relativeFromImg = path.relative(imgDir, filePath);
        const parts = relativeFromImg.split(path.sep);
        
        const categoryMapping = {
            'bathroom essentials': 'Bathroom Essentials',
            'bedroom essentials': 'Bedroom Essentials',
            'furniture': 'Furniture',
            'home decor': 'Home Decor',
            'kitchen essentials': 'Kitchen Essentials',
            'storage and space': 'Storage and Space'
        };
        const category = categoryMapping[parts[0].toLowerCase()] || parts[0];

        const fileName = path.basename(filePath, path.extname(filePath));

        // Regex to match "price X" or "priceX" or "rpice X" or "rpiceX" (ignoring case)
        const priceRegex = /(?:price|rpice)\s*([\d,]+)/i;
        const priceMatch = fileName.match(priceRegex);

        let price = 0;
        let cleanNameAndDesc = fileName;

        if (priceMatch) {
            // Extract numbers and remove commas
            price = parseFloat(priceMatch[1].replace(/,/g, ''));
            // Remove the price part from the title text
            cleanNameAndDesc = fileName.substring(0, priceMatch.index).trim();
        }

        // Clean up title text by removing trailing/leading special characters
        cleanNameAndDesc = cleanNameAndDesc
            .replace(/[\s\-\\d\.,]+$/, '') // remove trailing separators
            .trim();

        // Separate Name and Description
        // Let's look for double spaces, dashes, or commas to split, or default to a reasonable split
        let name = cleanNameAndDesc;
        let description = "";

        if (cleanNameAndDesc.includes("  ")) {
            const splitParts = cleanNameAndDesc.split("  ");
            name = splitParts[0].trim();
            description = splitParts.slice(1).join(" ").trim();
        } else if (cleanNameAndDesc.includes(" - ")) {
            const splitParts = cleanNameAndDesc.split(" - ");
            name = splitParts[0].trim();
            description = splitParts.slice(1).join(" ").trim();
        } else if (cleanNameAndDesc.includes(", ")) {
            const splitParts = cleanNameAndDesc.split(", ");
            name = splitParts[0].trim();
            description = splitParts.slice(1).join(", ").trim();
        }

        // Clean name/description helpers
        // Remove prefixes like "Buy " or suffixes
        if (name.startsWith("Buy ")) {
            name = name.substring(4);
        }
        if (name.startsWith("Shop ")) {
            name = name.substring(5);
        }

        // Limit name length for UI clean look
        if (name.length > 50) {
            // Try to split on space to avoid truncating in the middle of a word
            const shortName = name.substring(0, 45);
            const lastSpace = shortName.lastIndexOf(" ");
            name = lastSpace > 0 ? shortName.substring(0, lastSpace) : shortName;
        }

        if (!description) {
            description = `High-quality curated ${name.toLowerCase()} for your home and lifestyle.`;
        }

        // Clean any odd character relics (like the  character from copy paste)
        name = name.replace(/\ufffd/g, 'e');
        description = description.replace(/\ufffd/g, 'e');

        // Clean spelling typos
        name = name
            .replace(/Europian/g, 'European')
            .replace(/Dear showpiece/i, 'Deer Showpiece')
            .replace(/Dcor/g, 'Decor')
            .replace(/Dcor/g, 'Decor')
            .replace(/Dcor/g, 'Decor')
            .replace(/Drawerrpice/i, 'Drawer Price');

        description = description
            .replace(/Europian/g, 'European')
            .replace(/Dear showpiece/i, 'Deer Showpiece')
            .replace(/Dcor/g, 'Decor')
            .replace(/Dcor/g, 'Decor')
            .replace(/Dcor/g, 'Decor')
            .replace(/Drawerrpice/i, 'Drawer Price');

        products.push({
            id: idCounter++,
            name: name,
            price: price || 999, // default fallback price
            description: description,
            category: category,
            image_url: relPath,
            stock: Math.floor(Math.random() * 20) + 5 // random stock between 5 and 25 for realism
        });
    });

    fs.writeFileSync(outputFile, JSON.stringify(products, null, 2), 'utf-8');
    console.log(`Successfully parsed and saved ${products.length} products to products.json`);
}

parseProducts();
