
function isTextureNonStandard(texture) {
    try {
        const img = new Image();
        img.src = texture.base64;

        if (img.complete && img.naturalWidth > 0) {
            const aspectRatio = img.naturalWidth / img.naturalHeight;
            return aspectRatio < 0.5 || aspectRatio > 2.0;
        }
    } catch (e) {
        console.warn('Failed to parse texture dimensions:', texture.name);
    }

    return false;
}

function isHalfHeightBlock(blockName) {
    // Check if block name ends with "Slab"
    if (blockName.endsWith(' Slab')) {
        return true;
    }

    // Check if block name matches "Fallen * Leaves" pattern
    if (blockName.startsWith('Fallen ') && blockName.endsWith(' Leaves')) {
        return true;
    }

    return false;
}
