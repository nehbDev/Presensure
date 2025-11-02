const fs = require('fs');
const path = require('path');

function fixGradleConfig() {
  const buildGradlePath = path.join(__dirname, 'android', 'app', 'build.gradle');
  
  if (!fs.existsSync(buildGradlePath)) {
    console.error('❌ android/app/build.gradle not found');
    return false;
  }

  let content = fs.readFileSync(buildGradlePath, 'utf8');
  
  // Remove the problematic configurations.all block that uses 'requested'
  const problematicPattern = /configurations\.all\s*\{[^}]*requested[^}]*\}/;
  
  if (content.match(problematicPattern)) {
    content = content.replace(problematicPattern, '');
    fs.writeFileSync(buildGradlePath, content, 'utf8');
    console.log('✅ Removed problematic gradle configuration');
    return true;
  }
  
  console.log('✅ No problematic configuration found');
  return true;
}

fixGradleConfig();