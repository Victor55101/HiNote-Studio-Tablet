package com.hinote.studio;

import java.io.File;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Updating the bundled Original must preserve user-created data. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,manifest=Config.NONE)
public class BundledCalibrationUpdateTest {
    @Test public void updateRefreshesOldOriginalWithoutOverwritingDraftOrProfiles()throws Exception{
        MainActivity activity=Robolectric.buildActivity(MainActivity.class).get();
        File bank=new File(activity.getFilesDir(),"glyphs_v24.json");
        File draft=new File(activity.getFilesDir(),"draft-v23.json");
        File profiles=new File(activity.getFilesDir(),"profiles-v1");assertTrue(profiles.isDirectory()||profiles.mkdirs());
        File custom=new File(profiles,"saved-user-profile.hnprofile");
        byte[] preserved="existing user data".getBytes(StandardCharsets.UTF_8);
        Files.write(bank.toPath(),"{\"glyphs\":{}}".getBytes(StandardCharsets.UTF_8));
        Files.write(draft.toPath(),preserved);Files.write(custom.toPath(),preserved);
        Method refresh=MainActivity.class.getDeclaredMethod("copyEngineAsset",String.class);refresh.setAccessible(true);
        refresh.invoke(activity,"glyphs_v24.json");
        JSONObject updated=new JSONObject(new String(Files.readAllBytes(bank.toPath()),StandardCharsets.UTF_8));
        try(InputStream source=activity.getAssets().open("glyphs_v24.json")){
            assertEquals(new String(source.readAllBytes(),StandardCharsets.UTF_8),new String(Files.readAllBytes(bank.toPath()),StandardCharsets.UTF_8));
        }
        assertTrue(updated.getJSONObject("glyphs").length()>=105);
        assertArrayEquals(preserved,Files.readAllBytes(draft.toPath()));
        assertArrayEquals(preserved,Files.readAllBytes(custom.toPath()));
    }
}
