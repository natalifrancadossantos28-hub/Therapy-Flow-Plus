package br.com.nfs.minhaagenda;

import java.time.*;
import java.util.*;

/** Regras puras: horário de Ibiúna, sem depender do fuso configurado no telefone. */
final class Planner {
  static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
  static final class Alarm {
    final String key,title,clock,place; final long at;
    Alarm(String key,String title,String clock,String place,long at) {
      this.key=key;this.title=title;this.clock=clock;this.place=place;this.at=at;
    }
  }
  static List<Alarm> event(long id,String title,String date,String hour,String place,
      Integer before,boolean done,long now) {
    List<Alarm> out=new ArrayList<>();
    if(done||before==null||hour==null||hour.isEmpty())return out;
    try {
      long at=LocalDateTime.of(LocalDate.parse(date),LocalTime.parse(hour)).atZone(ZONE).toInstant().toEpochMilli();
      if(at<=now)return out;
      String base=id+":"+date+":"+hour;
      out.add(new Alarm(base+":hora",title,hour,place,at));
      long advance=at-before*60000L;
      if(before>0&&advance>now)out.add(new Alarm(base+":antes-"+before,"Em "+before+" min: "+title,hour,place,advance));
    } catch(DateTimeException ignored) { /* dado inválido não cria alarme em horário incorreto */ }
    return out;
  }
}
