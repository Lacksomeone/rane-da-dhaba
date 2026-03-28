const fs = require('fs');
['server.js', 'public/js/app.js'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\\\$/g, '$');
  content = content.replace(/\\`/g, '`');
  fs.writeFileSync(file, content);
  console.log(`Fixed ${file}`);
});
