package br.com.nfs.minhaagenda;
import java.time.*;
import java.util.*;
public class PlannerTest {
  static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
  public static void main(String[] args){
    long now=Instant.parse("2026-10-30T12:00:00Z").toEpochMilli();
    List<Planner.Alarm> a=Planner.event(1,"Reunião","2026-10-30","10:00","Sala",60,false,now);
    check(a.size()==1,"Lembrete anterior já vencido não dispara; horário principal permanece");
    check(a.get(0).at==Instant.parse("2026-10-30T13:00:00Z").toEpochMilli(),"10h em Ibiúna equivale a 13h UTC");
    List<Planner.Alarm> b=Planner.event(1,"Reunião","2026-10-30","11:00","Sala",60,false,now);
    check(b.size()==2,"Aviso antecipado e na hora são independentes");
    check(!b.get(0).key.equals(b.get(1).key),"Chaves não colidem entre os dois avisos");
    check(!a.get(0).key.equals(b.get(0).key),"Reagendamento cria nova chave");
    check(Planner.event(1,"Reunião","2026-10-30","11:00","",0,false,now).size()==1,"Antecedência zero não duplica");
    check(Planner.event(1,"Reunião","2026-10-30","11:00","",null,false,now).isEmpty(),"Não avisar é respeitado");
    check(Planner.event(1,"Reunião","2026-10-30","11:00","",0,true,now).isEmpty(),"Concluído não desperta");
    check(Planner.event(1,"Reunião","2026-10-30",null,"",0,false,now).isEmpty(),"Dia todo não inventa horário");
    check(Planner.event(1,"Reunião","2026-10-30","08:00","",0,false,now).isEmpty(),"Passado não desperta de novo");
    check(Planner.event(1,"Reunião","inválida","11:00","",0,false,now).isEmpty(),"Data inválida não agenda");
    TimeZone.setDefault(TimeZone.getTimeZone("Asia/Tokyo"));
    check(Planner.event(1,"Reunião","2026-10-30","10:00","",0,false,now).get(0).at==a.get(0).at,"Fuso do aparelho não desloca reunião de Ibiúna");
    System.out.println("OK: horário exato, fuso, antecedência, sem duplicatas, reagendamento, opt-out, concluídos e datas inválidas.");
  }
}
