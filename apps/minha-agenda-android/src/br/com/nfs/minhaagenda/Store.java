package br.com.nfs.minhaagenda;

import android.content.*;
import android.security.keystore.*;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Sessão e compromissos só no armazenamento privado, cifrados por chave do Android Keystore. */
final class Store {
  private static final String ALIAS="nfs.minhaagenda.private.v1";
  static SharedPreferences prefs(Context c){return c.getSharedPreferences("agenda",Context.MODE_PRIVATE);}
  private static javax.crypto.SecretKey key() throws Exception {
    KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
    if(ks.containsAlias(ALIAS))return (javax.crypto.SecretKey)ks.getKey(ALIAS,null);
    KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
    g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
    return g.generateKey();
  }
  static synchronized void put(Context c,String name,String value) throws Exception {
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
    String encoded=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+
      Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
    if(!prefs(c).edit().putString(name,encoded).commit())throw new Exception("Não foi possível salvar neste aparelho.");
  }
  static synchronized String get(Context c,String name) throws Exception {
    String v=prefs(c).getString(name,null);if(v==null)return null;
    String[] parts=v.split(":",2);if(parts.length!=2)throw new Exception("Entre novamente com seu PIN.");
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
    return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);
  }
  static synchronized void clear(Context c){prefs(c).edit().clear().commit();}
}
