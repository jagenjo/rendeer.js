cd "$(dirname "$0")"
python builder.py deploy_files.txt -o ../build/rendeer.min.js -o2 ../build/rendeer.js --nomin
chmod a+rw ../build/* 
