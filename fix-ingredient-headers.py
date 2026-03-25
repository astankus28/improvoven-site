#!/usr/bin/env python3
# fix-ingredient-headers.py
# Run from root of improvoven-site: python3 fix-ingredient-headers.py
# Scans all recipe HTML files and adds ingredient-header class to section headers

import os, re

def is_header(ingredient_text):
    """Detect if an ingredient line is actually a section header."""
    text = ingredient_text.strip()
    if not text:
        return False
    # Must not start with a number or fraction
    if re.match(r'^\d|^\d+\/|^½|^¼|^¾|^⅓|^⅔', text):
        return False
    # Must not start with common ingredient starters
    starters = ['salt', 'pepper', 'olive', 'water', 'a ', 'an ', 'to taste',
                'pinch', 'dash', 'handful', 'splash', 'drizzle', 'squeeze',
                'fresh', 'dried', 'ground', 'chopped', 'minced', 'sliced',
                'kosher', 'black', 'white', 'red', 'green', 'large', 'small',
                'medium', 'heavy', 'light', 'extra', 'optional']
    lower = text.lower()
    for s in starters:
        if lower.startswith(s):
            return False
    # Must not contain a comma (ingredient with preparation note)
    if ',' in text:
        return False
    # Must be short (headers are typically 1-4 words)
    if len(text) > 45:
        return False
    # Must not contain units
    units = ['cup', 'tbsp', 'tsp', 'oz', 'lb', 'gram', 'ml', 'liter', 'pound', 'ounce', 'clove', 'can', 'jar', 'pkg']
    for u in units:
        if u in lower:
            return False
    return True

def fix_recipe_file(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Check if it has an ingredients list
    if 'ingredients-list' not in content:
        return False
    
    # Already fixed
    if 'ingredient-header' in content:
        return False
    
    # Add CSS for ingredient headers if not present
    if '.ingredient-header' not in content:
        content = content.replace(
            ".ingredients-list li::before{content:'◆'",
            ".ingredients-list li.ingredient-header{grid-column:1/-1;font-family:'Playfair Display',serif;font-weight:700;font-size:1rem;color:var(--green);border-bottom:2px solid var(--green);padding-bottom:0.3rem;margin-top:1rem;}\n.ingredients-list li.ingredient-header::before{content:'';margin:0;}\n.ingredients-list li::before{content:'◆'"
        )
    
    # Find all ingredient li items and check if they're headers
    def replace_li(match):
        full = match.group(0)
        text = match.group(1).strip()
        # Strip any itemprop attributes to get clean text
        clean = re.sub(r'<[^>]+>', '', text).strip()
        if is_header(clean):
            # Replace with header version (no itemprop, add class)
            return f'<li class="ingredient-header">{clean}</li>'
        return full
    
    new_content = re.sub(
        r'<li itemprop="recipeIngredient">(.*?)</li>',
        replace_li,
        content
    )
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

# Walk all recipe directories
recipes_dir = 'recipes'
fixed = 0
skipped = 0

for slug in os.listdir(recipes_dir):
    # Skip category pages
    if slug in ['dinner', 'breakfast', 'italian', 'latin', 'budget', 'quick', 'dessert', 'index.html']:
        continue
    filepath = os.path.join(recipes_dir, slug, 'index.html')
    if not os.path.exists(filepath):
        continue
    if fix_recipe_file(filepath):
        print(f'✓ Fixed: {slug}')
        fixed += 1
    else:
        skipped += 1

print(f'\n✅ Fixed {fixed} recipes, skipped {skipped}')
print('Commit and push in GitHub Desktop.')
