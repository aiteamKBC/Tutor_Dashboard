from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta, datetime
import random
from accounts.models import User, DoctorProfile
from academics.models import Module, Group, Student
from sessions.models import Session
from evidence.models import Evidence

class Command(BaseCommand):
    help = 'Seed database with demo data'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding database...')
        
        # Create tutor user
        tutor_user, _ = User.objects.get_or_create(
            email='tutor@example.com',
            username='tutor',
            defaults={
                'role': 'tutor',
                'first_name': 'Ahmed',
                'last_name': 'Hassan'
            }
        )
        tutor_user.set_password('password123')
        tutor_user.save()
        self.stdout.write(self.style.SUCCESS(f'Created tutor: {tutor_user.email}'))
        
        # Create doctors
        doctors_data = [
            {'email': 'doctor1@example.com', 'username': 'doctor1', 'first_name': 'محمد', 'last_name': 'أحمد', 'display_name': 'د. محمد أحمد'},
            {'email': 'doctor2@example.com', 'username': 'doctor2', 'first_name': 'فاطمة', 'last_name': 'علي', 'display_name': 'د. فاطمة علي'},
            {'email': 'doctor3@example.com', 'username': 'doctor3', 'first_name': 'خالد', 'last_name': 'محمود', 'display_name': 'د. خالد محمود'},
        ]
        
        doctors = []
        for doc_data in doctors_data:
            user, _ = User.objects.get_or_create(
                email=doc_data['email'],
                username=doc_data['username'],
                defaults={
                    'role': 'doctor',
                    'first_name': doc_data['first_name'],
                    'last_name': doc_data['last_name']
                }
            )
            user.set_password('password123')
            user.save()
            
            profile, _ = DoctorProfile.objects.get_or_create(
                user=user,
                defaults={'display_name': doc_data['display_name'], 'title': 'استشاري'}
            )
            doctors.append(profile)
            self.stdout.write(self.style.SUCCESS(f'Created doctor: {profile.display_name}'))
        
        # Create modules
        modules_data = [
            {'name': 'التشريح الطبي', 'code': 'MED101'},
            {'name': 'علم وظائف الأعضاء', 'code': 'MED102'},
            {'name': 'الكيمياء الحيوية', 'code': 'MED103'},
            {'name': 'علم الأمراض', 'code': 'MED201'},
            {'name': 'الصيدلة السريرية', 'code': 'MED202'},
        ]
        
        modules = []
        for mod_data in modules_data:
            module, _ = Module.objects.get_or_create(
                code=mod_data['code'],
                defaults={'name': mod_data['name']}
            )
            modules.append(module)
            self.stdout.write(self.style.SUCCESS(f'Created module: {module.name}'))
        
        # Create groups
        groups_data = [
            {'name': 'المجموعة A', 'doctor': doctors[0], 'modules': [modules[0], modules[1]]},
            {'name': 'المجموعة B', 'doctor': doctors[0], 'modules': [modules[2]]},
            {'name': 'المجموعة C', 'doctor': doctors[1], 'modules': [modules[1], modules[3]]},
            {'name': 'المجموعة D', 'doctor': doctors[1], 'modules': [modules[4]]},
            {'name': 'المجموعة E', 'doctor': doctors[2], 'modules': [modules[0], modules[2], modules[4]]},
        ]
        
        groups = []
        for grp_data in groups_data:
            group, created = Group.objects.get_or_create(
                name=grp_data['name'],
                doctor=grp_data['doctor'],
                defaults={
                    'start_date': timezone.now().date() - timedelta(days=90),
                    'end_date': timezone.now().date() + timedelta(days=90)
                }
            )
            if created:
                group.modules.set(grp_data['modules'])
            groups.append(group)
            self.stdout.write(self.style.SUCCESS(f'Created group: {group.name}'))
        
        # Create students
        students_names = [
            'أحمد محمد', 'سارة علي', 'محمود حسن', 'نور الدين', 'ليلى أحمد',
            'عمر خالد', 'مريم سعيد', 'يوسف إبراهيم', 'هدى محمود', 'كريم عبدالله',
            'رنا حسين', 'طارق فهمي', 'دينا صلاح', 'وليد عادل', 'ياسمين رضا'
        ]
        
        for group in groups:
            for i, name in enumerate(students_names[:random.randint(8, 12)]):
                Student.objects.get_or_create(
                    full_name=name,
                    email=f'{name.replace(" ", ".").lower()}.{group.id}@student.edu',
                    group=group,
                    defaults={'active': True}
                )
        
        self.stdout.write(self.style.SUCCESS('Created students'))
        
        # Create sessions
        subjects = [
            'مقدمة في التشريح', 'الجهاز العصبي', 'الجهاز الدوري', 'الجهاز التنفسي',
            'الجهاز الهضمي', 'الجهاز البولي', 'الغدد الصماء', 'الجهاز المناعي',
            'علم الخلايا', 'الأنسجة الطبية', 'التمثيل الغذائي', 'الوراثة الطبية'
        ]
        
        for group in groups:
            for module in group.modules.all():
                # Create 15-25 sessions per group-module combination
                num_sessions = random.randint(15, 25)
                for i in range(num_sessions):
                    session_date = timezone.now() - timedelta(days=random.randint(1, 90))
                    
                    # Vary the met_count to create different achievement levels
                    met_count = random.choices(
                        [12, 11, 10, 9, 8, 7, 6],
                        weights=[30, 20, 15, 15, 10, 5, 5]
                    )[0]
                    
                    partial_count = random.randint(0, 12 - met_count)
                    not_met_count = 12 - met_count - partial_count
                    
                    Session.objects.get_or_create(
                        group=group,
                        module=module,
                        doctor=group.doctor,
                        subject=random.choice(subjects),
                        session_date=session_date,
                        defaults={
                            'duration_minutes': random.randint(45, 120),
                            'met_count': met_count,
                            'partial_count': partial_count,
                            'not_met_count': not_met_count
                        }
                    )
        
        self.stdout.write(self.style.SUCCESS('Created sessions'))
        
        self.stdout.write(self.style.SUCCESS('Database seeded successfully!'))
        self.stdout.write(self.style.SUCCESS('Tutor login: tutor@example.com / password123'))
        self.stdout.write(self.style.SUCCESS('Doctor logins: doctor1@example.com, doctor2@example.com, doctor3@example.com / password123'))
