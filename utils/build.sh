cd "$(dirname "$0")"
python builder.py deploy_files.txt -o ../build/rendeer.min.js -o2 ../build/rendeer.js
cat ../external/gl-matrix-min.js ../external/litegl.min.js ../build/rendeer.min.js > ../build/rendeer.full.min.js
chmod a+rw ../build/* 
