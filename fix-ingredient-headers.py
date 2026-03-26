#!/usr/bin/env python3
# fix-ingredient-headers.py
# Run from root of improvoven-site: python3 fix-ingredient-headers.py

import os, re

def is_header(text):
    text = text.strip()
    if not text: return False
    if re.match(r'^\d|^½|^¼|^¾|^⅓|^⅔', text): return False
    starters = ['salt','pepper','olive','water','a ','an ','to taste','pinch','dash',
                'handful','splash','drizzle','squeeze','fresh','dried','ground',
                'chopped','minced','sliced','kosher','black','white','red','green',
                'large','small','medium','heavy','light','extra','optional','favorite']
    lower = text.lower()
    for s in starters:
        if lower.startswith(s): return False
    if ',' in text: return False
    if len(text) > 45: return False
    units = ['cup','tbsp','tsp','oz','lb','gram','ml','liter','pound','ounce','clove','can','jar','pkg','tablespoon','teaspoon']
    for u in units:
        if u in lower: return False
    return True

HEADER_CSS = '''.ingredients-list li.ingredient-header{grid-column:1/-1;font-family:'Playfair Display',serif;font-weight:700;font-size:1rem;color:var(--green);border-bottom:2px solid var(--green);padding-bottom:0.3rem;margin-top:1rem;}
.ingredients-list li.ingredient-header::before{content:'';margin:0;}
'''

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    if 'ingredients-list' not in content: return False
    if 'ingredient-header' in content: return False
    
    # Add header CSS
    content = content.replace(
        ".ingredients-list li::before{",
        HEADER_CSS + ".ingredients-list li::before{"
    )
    
    # Fix plain <li> tags (legacy recipes)
    def fix_plain_li(match):
        text = match.group(1).strip()
        clean = re.sub(r'<[^>]+>', '', text).strip()
        if is_header(clean):
            return f'<li class="ingredient-header">{clean}</li>'
        return match.group(0)
    
    # Fix itemprop li tags (generated recipes)
    def fix_itemprop_li(match):
        text = match.group(1).strip()
        clean = re.sub(r'<[^>]+>', '', text).strip()
        if is_header(clean):
            return f'<li class="ingredient-header">{clean}</li>'
        return match.group(0)
    
    new = re.sub(r'<li itemprop="recipeIngredient">(.*?)</li>', fix_itemprop_li, content)
    new = re.sub(r'<li(?!\s+class)(?!\s+itemprop)>(.*?)</li>', fix_plain_li, new)
    
    if new != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new)
        return True
    return False

fixed = skipped = 0
for slug in os.listdir('recipes'):
    if slug in ['dinner','breakfast','italian','latin','budget','quick','dessert','index.html']:
        continue
    fp = os.path.join('recipes', slug, 'index.html')
    if not os.path.exists(fp): continue
    if fix_file(fp):
        print(f'✓ {slug}'); fixed += 1
    else:
        skipped += 1

print(f'\n✅ Fixed {fixed}, skipped {skipped}')
print('Commit and push in GitHub Desktop.')
