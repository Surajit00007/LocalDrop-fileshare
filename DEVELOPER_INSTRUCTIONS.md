Developer Instructions (Quick)

After you update the browser UI in `dist/index.html`, sync it into the Android assets and run/launch the app:

Windows copy (exact):

```
xcopy /Y "c:\Users\suraj\Downloads\local-file-drop-main\dist\index.html" "c:\Users\suraj\Downloads\local-file-drop-main\local_drop_app\android\app\src\main\assets\www\"
```

Build and run:

```
cd local_drop_app
flutter clean
flutter pub get
flutter run -d RZCY70SA7HX
```

To update GitHub after editing the UI or docs:

```
git add dist/index.html local_drop_app/android/app/src/main/assets/www/index.html DEVELOPER_INSTRUCTIONS.md
git commit -m "docs: add developer instructions"
git push origin main
```
